"""
Firebase Cloud Messaging send helpers.

Public API:
    - is_configured()           -> bool  (env has a service account)
    - init_firebase()           -> firebase app | None
    - send_push(user, ...)      -> dict   (best-effort, never raises)
    - send_push_to_tokens(...)  -> dict   (best-effort, never raises)

All sends are best-effort: a Firebase outage or mis-configuration must
never break message delivery or notification creation on the main API
path. Failures are logged, never raised.
"""

import base64
import json
import logging
import os

logger = logging.getLogger("ycomps.fcm")

_app = None
_initialized = False


def is_configured():
    """True when a Firebase service-account credential is available via env."""
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return True
    if os.environ.get("FCM_SERVICE_ACCOUNT"):
        return True
    return False


def init_firebase():
    """Initialise (once) and return the default firebase_admin app.

    Returns the app, or ``None`` if Firebase is not configured / could not
    be initialised. Safe to call repeatedly.
    """
    global _app, _initialized
    if _initialized:
        return _app
    _initialized = True

    if not is_configured():
        # Not every deploy uses Firebase push (e.g. local dev). Stay quiet.
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials

        if firebase_admin._apps:
            _app = firebase_admin._apps[0]
            return _app

        cred = _load_credentials(credentials)
        if cred is None:
            logger.warning("FCM env present but no usable service account found.")
            return None
        _app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialised for FCM push delivery.")
    except Exception:
        logger.exception("Failed to initialise Firebase Admin — FCM push disabled.")
        _app = None
    return _app


def _load_credentials(credentials):
    """Build a firebase_admin credentials.Certificate from env."""
    sa_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if sa_path and os.path.exists(sa_path):
        return credentials.Certificate(sa_path)

    raw = os.environ.get("FCM_SERVICE_ACCOUNT")
    if not raw:
        return None

    # Accept either raw JSON or a base64-encoded JSON string.
    info = None
    try:
        info = json.loads(raw)
    except (ValueError, TypeError):
        try:
            decoded = base64.b64decode(raw).decode("utf-8")
            info = json.loads(decoded)
        except Exception:
            logger.error("FCM_SERVICE_ACCOUNT is neither JSON nor base64 JSON.")
            return None
    if not isinstance(info, dict):
        return None
    return credentials.Certificate(info)


def send_push_to_tokens(tokens, title, body, data=None):
    """Push a notification to a set of FCM tokens.

    ``tokens`` may be a queryset/iterator of strings or a list. Returns a
    summary dict. Best-effort: never raises. Invalid tokens are flagged
    inactive so we stop retrying them.
    """
    from notifications.models import NotificationDevice

    app = init_firebase()
    if app is None:
        return {"disabled": True}

    tokens = [str(t) for t in tokens if t]
    if not tokens:
        return {"sent": 0, "total": 0}

    try:
        from firebase_admin import messaging
    except Exception:
        logger.exception("firebase_admin.messaging unavailable — FCM disabled.")
        return {"disabled": True}

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data={str(k): str(v) for k, v in (data or {}).items()},
        tokens=tokens,
    )

    try:
        result = messaging.send_each_for_multicast(message)
    except Exception:
        logger.exception("FCM multicast send failed.")
        return {"sent": 0, "total": len(tokens), "error": True}

    # Reconcile invalid/stale tokens so they don't accumulate forever.
    invalid = []
    for resp, token in zip(result.responses, tokens):
        if not resp.success and resp.exception is not None:
            code = getattr(resp.exception, "code", None) or ""
            code_name = (code or "").lower()
            if (
                "unregist" in code_name
                or "invalid" in code_name
                or "mismatch" in code_name
                or "not-registered" in code_name
            ):
                invalid.append(token)
    if invalid:
        NotificationDevice.objects.filter(fcm_token__in=invalid).update(is_active=False)

    return {
        "sent": result.success_count,
        "total": len(tokens),
        "failed": result.failure_count,
        "invalidated": len(invalid),
    }


def send_push(user, title, body, data=None):
    """Push a notification to every active FCM device registered for ``user``.

    Returns a summary dict. Best-effort: never raises.
    """
    from notifications.models import NotificationDevice

    app = init_firebase()
    if app is None:
        return {"disabled": True}

    tokens = list(
        NotificationDevice.objects.filter(user=user, is_active=True)
        .exclude(fcm_token="")
        .values_list("fcm_token", flat=True)
    )
    if not tokens:
        return {"sent": 0, "total": 0, "registered": 0}

    res = send_push_to_tokens(tokens, title, body, data)
    res["registered"] = len(tokens)
    return res
