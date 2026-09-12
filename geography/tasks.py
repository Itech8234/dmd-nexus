"""
Celery beat task (scheduled every 15 min in ycomps/celery.py) implementing
proposal section 19's "Report Overdue" alert and the OperationalStatus
transition into REPORT_OVERDUE.
"""

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from datetime import timedelta


@shared_task
def check_overdue_polling_units():
    from accounts.models import Role, User
    from geography.models import OperationalStatus, PollingUnit
    from notifications.models import NotificationType
    from notifications.services import broadcast_operations_event, notify_many

    threshold = timezone.now() - timedelta(hours=settings.YCOMPS_REPORT_OVERDUE_HOURS)

    candidates = PollingUnit.objects.filter(
        operational_status__in=[
            OperationalStatus.ACTIVE_REPORTING,
            OperationalStatus.RECENTLY_REPORTED,
        ]
    ).select_related("ward__lga")

    flagged = []
    for pu in candidates:
        latest_report = pu.reports.order_by("-device_captured_at").first()
        last_activity = latest_report.device_captured_at if latest_report else None

        # A polling unit with an active assignment but zero reports yet is
        # judged against its assignment time instead of never firing.
        if last_activity is None:
            active_assignment = pu.assignments.filter(status="active").order_by("-assigned_at").first()
            last_activity = active_assignment.assigned_at if active_assignment else None

        if last_activity is None or last_activity > threshold:
            continue

        pu.operational_status = OperationalStatus.REPORT_OVERDUE
        pu.save(update_fields=["operational_status", "updated_at"])
        flagged.append(pu)

    if not flagged:
        return {"flagged": 0}

    admins = list(User.objects.filter(role__in=[Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN], is_active=True))
    lga_ids = {pu.ward.lga_id for pu in flagged}
    coordinators = list(
        User.objects.filter(role=Role.LGA_COORDINATOR, scoped_lga_id__in=lga_ids, is_active=True)
    )

    for pu in flagged:
        recipients = admins + [c for c in coordinators if c.scoped_lga_id == pu.ward.lga_id]
        notify_many(
            recipients,
            NotificationType.REPORT_OVERDUE,
            title=f"Report overdue: {pu.official_code}",
            body=f"No report received from {pu.name} in over {settings.YCOMPS_REPORT_OVERDUE_HOURS}h.",
            related_object_type="polling_unit",
            related_object_id=pu.id,
        )

    broadcast_operations_event("report_overdue_flagged")
    return {"flagged": len(flagged)}
