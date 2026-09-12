"""
Explicit audit trail for sensitive actions (proposal section 23), beyond
the coarse request-level middleware. Uses a thread-local set by
auditlog.middleware to attribute the acting user, since model signals
don't have access to the request.
"""

import threading

from django.db.models.signals import post_save
from django.dispatch import receiver

_local = threading.local()


def get_current_user():
    return getattr(_local, "user", None)


def set_current_user(user):
    _local.user = user


def log_action(action, obj, result="success", detail=None):
    from .models import AuditLog

    AuditLog.objects.create(
        actor=get_current_user(),
        action=action,
        object_type=obj.__class__.__name__.lower(),
        object_id=str(obj.pk),
        detail=detail or {},
        result=result,
    )


@receiver(post_save, sender="officials.Assignment")
def audit_assignment(sender, instance, created, **kwargs):
    log_action(
        "official_assigned" if created else "assignment_updated",
        instance,
        detail={"official_id": str(instance.official_id), "polling_unit_id": str(instance.polling_unit_id), "status": instance.status},
    )


@receiver(post_save, sender="reports.Report")
def audit_report(sender, instance, created, **kwargs):
    if created:
        log_action(
            "report_submitted",
            instance,
            detail={"polling_unit_id": str(instance.polling_unit_id), "sync_status": instance.sync_status},
        )


@receiver(post_save, sender="incidents.Incident")
def audit_incident(sender, instance, created, **kwargs):
    if created:
        log_action(
            "incident_submitted",
            instance,
            detail={"polling_unit_id": str(instance.polling_unit_id), "severity": instance.severity},
        )


@receiver(post_save, sender="incidents.IncidentUpdate")
def audit_incident_update(sender, instance, created, **kwargs):
    if created:
        log_action(
            "incident_updated",
            instance.incident,
            detail={"new_status": instance.new_status, "note_present": bool(instance.note)},
        )


@receiver(post_save, sender="purequests.PollingUnitRequest")
def audit_pu_request(sender, instance, created, **kwargs):
    if created:
        log_action(
            "pu_request_submitted",
            instance,
            detail={"official_code": instance.official_code, "ward_id": str(instance.ward_id)},
        )
