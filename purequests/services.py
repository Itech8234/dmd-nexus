"""
Approval workflow services for polling unit requests.

`review_request` runs inside a single atomic transaction that row-locks the
request (select_for_update), re-validates code uniqueness against the live
PollingUnit registry, materialises the official PollingUnit (on approval),
and fans out the audit trail, notifications and operations-feed broadcast.
A concurrent double-approval is impossible: the second transaction blocks
on the row lock, then sees a non-pending status and fails cleanly.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Role, User
from auditlog.models import AuditLog
from geography.models import OperationalStatus, PollingUnit
from notifications.models import NotificationType
from notifications.services import broadcast_operations_event, notify, notify_many

from .models import PollingUnitRequest, RequestStatus


def audit_request_action(req, actor, action, detail=None):
    """Explicit audit entry with a guaranteed actor (the auditlog middleware
    thread-local isn't reliable outside the request cycle)."""
    AuditLog.objects.create(
        actor=actor,
        action=action,
        object_type="pollingunitrequest",
        object_id=str(req.pk),
        detail=detail or {},
    )


def notify_new_request(req):
    """Fan out to privileged admins + the ward's LGA coordinator."""
    recipients = list(
        User.objects.filter(role__in=[Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN], is_active=True).exclude(
            id=req.submitted_by_id
        )
    )
    coordinator = (
        User.objects.filter(role=Role.LGA_COORDINATOR, scoped_lga_id=req.ward.lga_id, is_active=True)
        .exclude(id=req.submitted_by_id)
        .first()
    )
    if coordinator and coordinator not in recipients:
        recipients.append(coordinator)

    submitter_name = ""
    if req.submitted_by:
        submitter_name = req.submitted_by.get_full_name() or req.submitted_by.username

    notify_many(
        recipients,
        NotificationType.PU_REQUEST_SUBMITTED,
        title=f"New polling unit request: {req.name}",
        body=(
            f"{submitter_name or 'A field user'} proposed #{req.official_code} "
            f"in {req.ward.name}, {req.ward.lga.name} — awaiting review."
        ),
        related_object_type="pu_request",
        related_object_id=str(req.id),
    )
    broadcast_operations_event("pu_request_submitted")


def _materialise_polling_unit(req):
    """Turn an approved request into the official PollingUnit record."""
    return PollingUnit.objects.create(
        ward=req.ward,
        official_code=req.official_code,
        name=req.name,
        location_description=req.location_description,
        latitude=req.latitude,
        longitude=req.longitude,
        operational_status=OperationalStatus.AWAITING_ASSIGNMENT,
        source_note=req.source_note or "Approved polling unit request",
    )


@transaction.atomic
def review_request(pu_request, reviewer, decision, note=""):
    """
    Approve or reject a pending request.

    decision: RequestStatus.APPROVED or RequestStatus.REJECTED
    note: mandatory when rejecting.
    """
    # Re-fetch under a row lock so concurrent reviewers serialise.
    req = (
        PollingUnitRequest.objects.select_for_update()
        .select_related("ward__lga")
        .get(pk=pu_request.pk)
    )

    if req.status != RequestStatus.PENDING:
        raise ValidationError({"detail": "This request has already been reviewed."})
    if req.submitted_by_id == reviewer.id:
        raise ValidationError({"detail": "You cannot review your own request."})

    note = (note or "").strip()
    created_pu = None

    if decision == RequestStatus.REJECTED:
        if not note:
            raise ValidationError({"note": "A note is required when rejecting a request."})
        req.status = RequestStatus.REJECTED
    elif decision == RequestStatus.APPROVED:
        if PollingUnit.objects.filter(official_code=req.official_code).exists():
            raise ValidationError({"official_code": "An official polling unit with this code already exists."})
        created_pu = _materialise_polling_unit(req)
        req.created_polling_unit = created_pu
        req.status = RequestStatus.APPROVED
    else:
        raise ValidationError({"detail": "Unknown decision."})

    req.reviewed_by = reviewer
    req.reviewed_at = timezone.now()
    req.review_note = note
    req.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note", "created_polling_unit"])

    audit_request_action(
        req,
        reviewer,
        "pu_request_approved" if decision == RequestStatus.APPROVED else "pu_request_rejected",
        detail={
            "polling_unit_id": str(created_pu.id) if created_pu else "",
            "official_code": req.official_code,
            "note_present": bool(note),
        },
    )

    # Tell the submitter (best-effort WebSocket push rides inside notify()).
    if req.submitted_by:
        if decision == RequestStatus.APPROVED:
            title = f"Polling unit request approved: {req.name}"
            body = f"#{req.official_code} in {req.ward.name}, {req.ward.lga.name} is now an official polling unit."
        else:
            title = f"Polling unit request rejected: {req.name}"
            body = note
        notify(
            req.submitted_by,
            NotificationType.PU_REQUEST_DECIDED,
            title=title,
            body=body,
            related_object_type="pu_request",
            related_object_id=str(req.id),
        )

    # The registry just changed — ping the command-centre live feed.
    broadcast_operations_event("pu_request_reviewed")
    return req