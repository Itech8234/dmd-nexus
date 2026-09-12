import uuid

from django.conf import settings
from django.db import models


class AuditResult(models.TextChoices):
    SUCCESS = "success", "Success"
    FAILURE = "failure", "Failure"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_actions"
    )
    action = models.CharField(max_length=100, help_text="e.g. 'assigned_official', 'report_submitted'")
    object_type = models.CharField(max_length=50, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    detail = models.JSONField(default=dict, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    result = models.CharField(max_length=10, choices=AuditResult.choices, default=AuditResult.SUCCESS)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["action"]),
        ]

    def __str__(self):
        return f"{self.action} by {self.actor} at {self.created_at:%Y-%m-%d %H:%M:%S}"
