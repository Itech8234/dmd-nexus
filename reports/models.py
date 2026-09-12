import uuid

from django.conf import settings
from django.db import models


class ReportCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.name


class SyncStatus(models.TextChoices):
    SAVED_OFFLINE = "saved_offline", "Saved Offline"
    SYNCHRONIZING = "synchronizing", "Synchronizing"
    SUBMITTED = "submitted", "Submitted"
    FAILED = "failed", "Failed"


class Report(models.Model):
    """
    A field report. `client_generated_id` is a UUID created on-device at
    creation time (before any server contact) so that offline-first clients
    can safely retry submission without creating duplicates - the server
    treats (official, client_generated_id) as the true unique key.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_generated_id = models.UUIDField(help_text="Generated on-device at creation time, for dedup on sync")

    polling_unit = models.ForeignKey("geography.PollingUnit", on_delete=models.CASCADE, related_name="reports")
    official = models.ForeignKey("officials.Official", on_delete=models.CASCADE, related_name="reports")
    category = models.ForeignKey(ReportCategory, on_delete=models.SET_NULL, null=True, related_name="reports")

    operational_status = models.CharField(max_length=32, help_text="Snapshot of geography.OperationalStatus at submission time")
    narrative = models.TextField(blank=True)

    device_captured_at = models.DateTimeField(help_text="Timestamp set on-device when report was created")
    server_received_at = models.DateTimeField(null=True, blank=True)

    sync_status = models.CharField(max_length=16, choices=SyncStatus.choices, default=SyncStatus.SUBMITTED)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-device_captured_at"]
        constraints = [
            models.UniqueConstraint(fields=["official", "client_generated_id"], name="unique_client_report_per_official")
        ]
        indexes = [
            models.Index(fields=["sync_status"]),
            models.Index(fields=["polling_unit", "-device_captured_at"]),
        ]

    def __str__(self):
        return f"Report {self.id} — {self.polling_unit.official_code}"


class ReportAttachment(models.Model):
    class Priority(models.IntegerChoices):
        REQUIRED_METADATA = 1, "Required Metadata"
        SUPPORTING_IMAGE = 2, "Supporting Image"
        OTHER_MEDIA = 3, "Other Media"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="report_attachments/%Y/%m/")
    priority = models.PositiveSmallIntegerField(choices=Priority.choices, default=Priority.SUPPORTING_IMAGE)
    sync_status = models.CharField(max_length=16, choices=SyncStatus.choices, default=SyncStatus.SAVED_OFFLINE)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["priority", "uploaded_at"]

    def __str__(self):
        return f"Attachment for {self.report_id}"
