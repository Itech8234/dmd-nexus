"""
Parses the compact command format field officials text in when they have
no data connection at all (proposal §14 — "SMS should remain a fallback
channel rather than the primary reporting system", so this is deliberately
terse: a report or incident in one message, no back-and-forth).

Formats (case-insensitive, extra whitespace tolerant):

    REPORT <PU_CODE> <STATUS> <free text notes...>
    INCIDENT <PU_CODE> <SEVERITY> <free text description...>

STATUS   one of: ACTIVE, RECENT, OFFLINE
         -> active_reporting, recently_reported, official_offline
SEVERITY one of: LOW, MED, HIGH, CRIT
         -> low, medium, high, critical

Example:
    REPORT YB/DTR/001 ACTIVE materials distributed, voting underway
    INCIDENT YB/DTR/003 HIGH thugs disrupting queue, need backup
"""

import re

STATUS_MAP = {
    "ACTIVE": "active_reporting",
    "RECENT": "recently_reported",
    "OFFLINE": "official_offline",
}

SEVERITY_MAP = {
    "LOW": "low",
    "MED": "medium",
    "HIGH": "high",
    "CRIT": "critical",
}

_COMMAND_RE = re.compile(
    r"^\s*(REPORT|INCIDENT)\s+(\S+)\s+(\S+)\s*(.*)$",
    re.IGNORECASE | re.DOTALL,
)


def parse_sms(body: str):
    """
    Returns a dict {type, polling_unit_code, status|severity, narrative}
    on success, or None if the message doesn't match the expected format.
    Field-level errors (unknown status code, etc.) also return None —
    the caller logs the raw message either way for a human to follow up.
    """
    if not body:
        return None

    match = _COMMAND_RE.match(body.strip())
    if not match:
        return None

    command, pu_code, code, narrative = match.groups()
    command = command.upper()
    code = code.upper()

    if command == "REPORT":
        status = STATUS_MAP.get(code)
        if status is None:
            return None
        return {
            "type": "report",
            "polling_unit_code": pu_code.upper(),
            "operational_status": status,
            "narrative": narrative.strip(),
        }

    if command == "INCIDENT":
        severity = SEVERITY_MAP.get(code)
        if severity is None:
            return None
        return {
            "type": "incident",
            "polling_unit_code": pu_code.upper(),
            "severity": severity,
            "narrative": narrative.strip(),
        }

    return None


def normalize_phone(raw: str) -> str:
    """Strips spaces/dashes and normalizes a leading '0' to Nigeria's +234."""
    if not raw:
        return ""
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("0"):
        digits = "+234" + digits[1:]
    elif digits.startswith("234"):
        digits = "+" + digits
    elif not digits.startswith("+"):
        digits = "+" + digits
    return digits
