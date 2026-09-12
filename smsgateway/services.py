"""
Core inbound-SMS handling: log every message, verify the sender is a
known field official (by phone number), parse the command, and — if
valid — create a PendingSmsSubmission for admin review. Nothing here
writes a real Report/Incident directly; SMS is a fallback intake channel,
not a trusted direct-write path (proposal §14/§21 — least-privilege,
data-minimization).
"""

import uuid

from django.utils import timezone

from geography.models import PollingUnit
from officials.models import Official
from accounts.models import Role, User

from .models import InboundSmsMessage, ParseResult, PendingSmsSubmission, SubmissionType
from .parsing import normalize_phone, parse_sms


def handle_inbound_sms(sender_phone: str, body: str, gateway_message_id: str = "", gateway_provider: str = ""):
    normalized_phone = normalize_phone(sender_phone)

    official = (
        Official.objects.filter(user__phone_number=normalized_phone, user__role=Role.FIELD_OFFICIAL)
        .select_related("user")
        .first()
    )

    if official is None:
        message = InboundSmsMessage.objects.create(
            sender_phone=normalized_phone,
            body=body,
            gateway_message_id=gateway_message_id,
            gateway_provider=gateway_provider,
            parse_result=ParseResult.UNKNOWN_SENDER,
            parse_note="No field official is registered with this phone number.",
        )
        _notify_admins_system_alert(
            "Unrecognized SMS sender",
            f"An SMS was received from {normalized_phone}, which is not linked to any field official.",
        )
        return message, None

    parsed = parse_sms(body)
    if parsed is None:
        message = InboundSmsMessage.objects.create(
            sender_phone=normalized_phone,
            body=body,
            gateway_message_id=gateway_message_id,
            gateway_provider=gateway_provider,
            matched_official=official,
            parse_result=ParseResult.UNPARSEABLE,
            parse_note="Message did not match the REPORT/INCIDENT command format.",
        )
        _notify_admins_system_alert(
            f"Unreadable SMS from {official}",
            "A field official sent an SMS that couldn't be parsed as a report or incident. Follow up directly.",
        )
        return message, None

    polling_unit = PollingUnit.objects.filter(official_code__iexact=parsed["polling_unit_code"]).first()
    if polling_unit is None:
        message = InboundSmsMessage.objects.create(
            sender_phone=normalized_phone,
            body=body,
            gateway_message_id=gateway_message_id,
            gateway_provider=gateway_provider,
            matched_official=official,
            parse_result=ParseResult.UNKNOWN_POLLING_UNIT,
            parse_note=f"Polling unit code '{parsed['polling_unit_code']}' not found.",
        )
        _notify_admins_system_alert(
            f"SMS references unknown polling unit ({official})",
            f"'{parsed['polling_unit_code']}' does not match any polling unit on record.",
        )
        return message, None

    message = InboundSmsMessage.objects.create(
        sender_phone=normalized_phone,
        body=body,
        gateway_message_id=gateway_message_id,
        gateway_provider=gateway_provider,
        matched_official=official,
        parse_result=ParseResult.PARSED,
    )

    assignment_mismatch = not official.assignments.filter(status="active", polling_unit=polling_unit).exists()
    client_id = uuid.uuid4()

    if parsed["type"] == "report":
        payload = {
            "client_generated_id": str(client_id),
            "polling_unit": str(polling_unit.id),
            "official": str(official.id),
            "operational_status": parsed["operational_status"],
            "narrative": parsed["narrative"],
            "device_captured_at": timezone.now().isoformat(),
        }
        submission_type = SubmissionType.REPORT
    else:
        payload = {
            "client_generated_id": str(client_id),
            "polling_unit": str(polling_unit.id),
            "reporter": str(official.id),
            "severity": parsed["severity"],
            "description": parsed["narrative"],
            "device_captured_at": timezone.now().isoformat(),
        }
        submission_type = SubmissionType.INCIDENT

    pending = PendingSmsSubmission.objects.create(
        source_message=message,
        submission_type=submission_type,
        polling_unit=polling_unit,
        official=official,
        payload=payload,
        assignment_mismatch=assignment_mismatch,
    )

    mismatch_note = " (this official has no active assignment to this polling unit — verify before approving)" if assignment_mismatch else ""
    _notify_admins_system_alert(
        f"SMS {submission_type} awaiting review — {polling_unit.official_code}",
        f"From {official} via SMS.{mismatch_note}",
    )

    return message, pending


def _notify_admins_system_alert(title, body):
    from notifications.models import NotificationType
    from notifications.services import notify_many

    admins = User.objects.filter(role__in=[Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN], is_active=True)
    notify_many(list(admins), NotificationType.SYSTEM_ALERT, title=title, body=body)


def approve_pending_submission(pending: PendingSmsSubmission, reviewer, note: str = ""):
    """
    Promotes a reviewed SMS submission into a real Report/Incident, using
    the same idempotent-create path as the app/API (safe to call more than
    once — the client_generated_id embedded at parse time makes retries
    inert), then updates the polling unit's operational status exactly as
    a normal submission would.
    """
    from geography.models import OperationalStatus
    from incidents.models import Incident
    from reports.models import Report, SyncStatus

    if pending.submission_type == SubmissionType.REPORT:
        official_id = pending.payload["official"]
        client_id = pending.payload["client_generated_id"]
        existing = Report.objects.filter(official_id=official_id, client_generated_id=client_id).first()
        if existing:
            report = existing
        else:
            report = Report.objects.create(
                client_generated_id=client_id,
                polling_unit_id=pending.payload["polling_unit"],
                official_id=official_id,
                operational_status=pending.payload["operational_status"],
                narrative=pending.payload["narrative"],
                device_captured_at=pending.payload["device_captured_at"],
                server_received_at=timezone.now(),
                sync_status=SyncStatus.SUBMITTED,
            )
            pu = report.polling_unit
            pu.operational_status = OperationalStatus.RECENTLY_REPORTED
            pu.save(update_fields=["operational_status", "updated_at"])
        result_id = report.id
    else:
        client_id = pending.payload["client_generated_id"]
        existing = Incident.objects.filter(client_generated_id=client_id).first()
        if existing:
            incident = existing
        else:
            incident = Incident.objects.create(
                client_generated_id=client_id,
                polling_unit_id=pending.payload["polling_unit"],
                reporter_id=pending.payload["reporter"],
                severity=pending.payload["severity"],
                description=pending.payload["description"],
                device_captured_at=pending.payload["device_captured_at"],
            )
            pu = incident.polling_unit
            pu.operational_status = OperationalStatus.INCIDENT_REPORTED
            pu.save(update_fields=["operational_status", "updated_at"])
        result_id = incident.id

    pending.status = "approved"
    pending.reviewed_by = reviewer
    pending.review_note = note
    pending.resulting_object_id = str(result_id)
    pending.reviewed_at = timezone.now()
    pending.save(update_fields=["status", "reviewed_by", "review_note", "resulting_object_id", "reviewed_at"])

    from notifications.services import broadcast_operations_event

    broadcast_operations_event("sms_submission_approved")

    _acknowledge_official(pending, "Your SMS report/incident was received and confirmed by the command centre.")
    return pending


def reject_pending_submission(pending: PendingSmsSubmission, reviewer, note: str = ""):
    pending.status = "rejected"
    pending.reviewed_by = reviewer
    pending.review_note = note
    pending.reviewed_at = timezone.now()
    pending.save(update_fields=["status", "reviewed_by", "review_note", "reviewed_at"])

    ack = "Your SMS report/incident could not be confirmed."
    if note:
        ack += f" Reason: {note}"
    _acknowledge_official(pending, ack)
    return pending


def _acknowledge_official(pending: PendingSmsSubmission, message: str):
    """
    Best-effort SMS acknowledgment back to the sending official. Uses the
    same no-op console backend until real gateway credentials are
    configured (see smsgateway/client.py) — never blocks or fails the
    review action if sending doesn't work.
    """
    from .client import send_sms

    phone = pending.official.user.phone_number
    if not phone:
        return
    try:
        send_sms(phone, message)
    except Exception:
        pass


def send_outbound_sms(phone_number: str, message: str) -> dict:
    """
    Convenience outbound wrapper used by the SMS bridge (critical-event
    paging) and the admin test endpoint. Raises on a misconfigured real
    backend; callers that must not fail should wrap in try/except.
    """
    from .client import send_sms

    if not phone_number:
        return {"status": "no_phone"}
    return send_sms(phone_number, message)


def notify_officials_via_sms(users, message: str):
    """
    Best-effort bulk SMS to a list of User objects (their phone_number when
    present). Used to page coordinators/admins on critical events. Never
    raises — failures are logged per recipient.
    """
    import logging

    logger = logging.getLogger("smsgateway.bridge")

    for user in users:
        phone = (getattr(user, "phone_number", "") or "").strip()
        if not phone:
            continue
        try:
            send_outbound_sms(phone, message)
        except Exception:
            logger.exception("SMS bridge failed for %s", user.username)


def sms_alert_critical_incident(incident):
    """
    High-severity SMS paging when a critical incident is logged: ping the
    LGA coordinator + all campaign/super admins (their phones only), then
    fall back to the console backend when no real provider is configured.
    """
    from accounts.models import Role, User

    pu = incident.polling_unit
    lga = pu.ward.lga
    title = f"CRITICAL INCIDENT #{pu.official_code}: {incident.get_severity_display().upper()}"
    message = f"{title} - {incident.description[:140]} - {lga.name} LGA, {pu.name}."

    recipients = list(User.objects.filter(role__in=[Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN], is_active=True))
    coord = User.objects.filter(role=Role.LGA_COORDINATOR, scoped_lga=lga, is_active=True).first()
    if coord:
        recipients.append(coord)

    notify_officials_via_sms(recipients, message)
