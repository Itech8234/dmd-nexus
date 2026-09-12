"""
Outbound SMS abstraction with pluggable, production-safe providers.

The interface is provider-agnostic: every backend implements a single
``send(to_phone, message) -> dict`` method (plus the required
``send_required`` attribute that reports whether it is *configured* enough to
actually send). Pick a backend with the ``SMS_GATEWAY_BACKEND`` env var:

    SMS_GATEWAY_BACKEND=console            # default, logs only (no credentials)
    SMS_GATEWAY_BACKEND=africas_talking    # Africa's Talking
    SMS_GATEWAY_BACKEND=termii             # Termii
    SMS_GATEWAY_BACKEND=twilio             # Twilio

Each real backend deliberately uses only the Python standard library
(``urllib.request``), so no third-party SDK is required and the providers are
plain, reviewable HTTP clients. They are safe by construction: a backend
whose credentials are missing reports ``send_required = False`` and
``send()`` raises ``SmsConfigurationError`` rather than sending nothing or
crashing callers that assume best-effort behaviour.

Callers use the convenience ``send_sms()`` helper, which returns the active
backend's ``send()`` result. ``send_sms`` is wired into the SMS fallback
acknowledgement path (``smsgateway/services.py``) and is best-effort there:
the caller already swallows exceptions, so a misconfigured provider never
blocks an approval/rejection action.
"""

import logging
import os
import urllib.parse
import urllib.request

logger = logging.getLogger("smsgateway")


class SmsConfigurationError(Exception):
    """Raised when a real backend is selected but missing required credentials."""


class SmsBackend:
    """Base interface. `send_required` True means the backend can send now."""

    send_required = False

    def send(self, to_phone: str, message: str):
        raise NotImplementedError


class ConsoleSmsBackend(SmsBackend):
    """Dev/default backend — logs instead of sending. Safe with no credentials."""

    def send(self, to_phone: str, message: str):
        logger.info("SMS (console backend) -> %s: %s", to_phone, message)
        return {"status": "logged", "to": to_phone}


def _post_json(url, payload, headers, timeout=15):
    """Small stdlib JSON POST helper shared by providers."""
    data = urllib.parse.urlencode(payload).encode("utf-8")
    if "application/json" in headers.get("Content-Type", ""):
        data = __import__("json").dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return resp.status, body


class AfricasTalkingBackend(SmsBackend):
    """Africa's Talking SMS API (REST). Requires API key + username + sender id."""

    def __init__(self, username=None, api_key=None, sender_id=None):
        self.username = username or os.environ.get("SMS_AFRICAS_TALKING_USERNAME", "")
        self.api_key = api_key or os.environ.get("SMS_AFRICAS_TALKING_API_KEY", "")
        self.sender_id = sender_id or os.environ.get("SMS_AFRICAS_TALKING_SENDER_ID", "")
        self.send_required = bool(self.username and self.api_key)
        self.endpoint = os.environ.get(
            "SMS_AFRICAS_TALKING_ENDPOINT",
            "https://api.africastalking.com/version1/messaging",
        )

    def send(self, to_phone, message):
        if not self.send_required:
            raise SmsConfigurationError(
                "AfricasTalking backend selected but SMS_AFRICAS_TALKING_USERNAME "
                "and SMS_AFRICAS_TALKING_API_KEY are not set."
            )
        payload = {
            "username": self.username,
            "to": to_phone,
            "message": message,
        }
        if self.sender_id:
            payload["from"] = self.sender_id
        headers = {
            "apiKey": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        status, body = _post_json(self.endpoint, payload, headers)
        if status not in (200, 201):
            raise RuntimeError(f"Africa's Talking SMS returned {status}: {body}")
        logger.info("SMS sent via Africa's Talking to %s", to_phone)
        return {"status": "sent", "provider": "africas_talking", "to": to_phone, "http": status}


class TermiiBackend(SmsBackend):
    """Termii SMS API. Requires API key + one of sender_id / from."""

    def __init__(self, api_key=None, sender_id=None):
        self.api_key = api_key or os.environ.get("SMS_TERMII_API_KEY", "")
        self.sender_id = sender_id or os.environ.get("SMS_TERMII_SENDER_ID", "")
        self.from_field = self.sender_id or os.environ.get("SMS_TERMII_FROM", "")
        self.send_required = bool(self.api_key and self.from_field)
        self.endpoint = os.environ.get(
            "SMS_TERMII_ENDPOINT", "https://api.ng.termii.com/api/sms/send"
        )

    def send(self, to_phone, message):
        if not self.send_required:
            raise SmsConfigurationError(
                "Termii backend selected but SMS_TERMII_API_KEY and "
                "SMS_TERMII_SENDER_ID/SMS_TERMII_FROM are not set."
            )
        payload = {
            "to": to_phone,
            "from": self.from_field,
            "sms": message,
            "type": "plain",
            "channel": "generic",
            "api_key": self.api_key,
        }
        headers = {"Content-Type": "application/json"}
        status, body = _post_json(self.endpoint, payload, headers)
        if status not in (200, 201):
            raise RuntimeError(f"Termii SMS returned {status}: {body}")
        logger.info("SMS sent via Termii to %s", to_phone)
        return {"status": "sent", "provider": "termii", "to": to_phone, "http": status}


class TwilioBackend(SmsBackend):
    """Twilio REST API. Requires account SID + auth token; sender phone (From) optional."""

    def __init__(self, account_sid=None, auth_token=None, from_phone=None):
        self.account_sid = account_sid or os.environ.get("SMS_TWILIO_ACCOUNT_SID", "")
        self.auth_token = auth_token or os.environ.get("SMS_TWILIO_AUTH_TOKEN", "")
        self.from_phone = from_phone or os.environ.get("SMS_TWILIO_FROM", "")
        self.send_required = bool(self.account_sid and self.auth_token)
        self.base = os.environ.get(
            "SMS_TWILIO_BASE_URL", "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        )

    def send(self, to_phone, message):
        if not self.send_required:
            raise SmsConfigurationError(
                "Twilio backend selected but SMS_TWILIO_ACCOUNT_SID and "
                "SMS_TWILIO_AUTH_TOKEN are not set."
            )
        url = self.base.format(sid=self.account_sid)
        payload = {"To": to_phone, "Body": message}
        if self.from_phone:
            payload["From"] = self.from_phone
        token = f"{self.account_sid}:{self.auth_token}".encode("utf-8")
        import base64

        auth = "Basic " + base64.b64encode(token).decode("ascii")
        headers = {
            "Authorization": auth,
            "Content-Type": "application/x-www-form-urlencoded",
        }
        status, body = _post_json(url, payload, headers)
        if status not in (200, 201):
            raise RuntimeError(f"Twilio SMS returned {status}: {body}")
        logger.info("SMS sent via Twilio to %s", to_phone)
        return {"status": "sent", "provider": "twilio", "to": to_phone, "http": status}


_BACKENDS = {
    "console": ConsoleSmsBackend,
    "africas_talking": AfricasTalkingBackend,
    "termii": TermiiBackend,
    "twilio": TwilioBackend,
}


def get_sms_backend():
    """Return the backend named by `SMS_GATEWAY_BACKEND` (default: console)."""
    name = os.environ.get("SMS_GATEWAY_BACKEND", "console").strip().lower()
    cls = _BACKENDS.get(name)
    if cls is None:
        logger.warning("Unknown SMS_GATEWAY_BACKEND %r; falling back to console.", name)
        return ConsoleSmsBackend()
    try:
        return cls()
    except TypeError:
        return cls()


def send_sms(to_phone: str, message: str):
    backend = get_sms_backend()
    # A non-console backend with missing credentials is a deployment error:
    # surface it loudly (callers like smsgateway/services.py already no-op).
    if not backend.send_required and not isinstance(backend, ConsoleSmsBackend):
        raise SmsConfigurationError(
            f"SMS backend '{os.environ.get('SMS_GATEWAY_BACKEND')}' is not configured "
            "with the credentials it needs."
        )
    return backend.send(to_phone, message)
