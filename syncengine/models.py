import uuid

from django.conf import settings
from django.db import models


class SyncRecordStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    IN_PROGRESS = "in_progress", "In Progress"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    DUPLICATE = "duplicate", "Duplicate (already applied)"


class SyncRecord(models.Model):
    """
    Server-side ledger of offline-origin payloads (reports, incidents,
    messages, attachments) submitted through the sync endpoint. Lets the
    device track per-item sync history, and lets admins audit sync
    reliability (a required KPI).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_id = models.CharField(max_length=100, help_text="Stable client-generated device identifier")
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sync_records")

    object_type = models.CharField(max_length=50, help_text="'report' | 'incident' | 'message' | 'attachment'")
    client_generated_id = models.UUIDField()
    server_object_id = models.CharField(max_length=64, blank=True)

    status = models.CharField(max_length=16, choices=SyncRecordStatus.choices, default=SyncRecordStatus.QUEUED)
    attempt_count = models.PositiveIntegerField(default=0)
    error_detail = models.TextField(blank=True)

    device_captured_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["device_id", "object_type", "client_generated_id"],
                name="unique_sync_item_per_device",
            )
        ]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"Sync[{self.object_type}] {self.client_generated_id} — {self.status}"
