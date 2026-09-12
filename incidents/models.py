import uuid

from django.conf import settings
from django.db import models


class IncidentCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, help_text="What this category covers — shown in forms and the admin panel.")
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive categories are hidden from new incident forms but keep their historical incidents.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Incident categories"

    def __str__(self):
        return self.name


class Severity(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class IncidentStatusChoice(models.TextChoices):
    NEW = "new", "New"
    REVIEWING = "reviewing", "Reviewing"
    ASSIGNED = "assigned", "Assigned"
    INVESTIGATING = "investigating", "Investigating"
    RESOLVED = "resolved", "Resolved"
    CLOSED = "closed", "Closed"


class Incident(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_generated_id = models.UUIDField(null=True, blank=True, help_text="For offline-created incidents, dedup on sync")

    polling_unit = models.ForeignKey("geography.PollingUnit", on_delete=models.CASCADE, related_name="incidents")
    reporter = models.ForeignKey("officials.Official", on_delete=models.SET_NULL, null=True, related_name="incidents_reported")
    category = models.ForeignKey(IncidentCategory, on_delete=models.SET_NULL, null=True, related_name="incidents")

    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.LOW)
    description = models.TextField()
    status = models.CharField(max_length=16, choices=IncidentStatusChoice.choices, default=IncidentStatusChoice.NEW)

    assigned_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="incidents_assigned"
    )
    resolution = models.TextField(blank=True)

    device_captured_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["reporter", "client_generated_id"],
                name="unique_client_incident_per_reporter",
            )
        ]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["severity"]),
        ]

    def __str__(self):
        return f"Incident {self.id} — {self.polling_unit.official_code} ({self.get_severity_display()})"


class IncidentUpdate(models.Model):
    """Audit-friendly log of status transitions / notes on an incident."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="incident_updates")
    note = models.TextField(blank=True)
    new_status = models.CharField(max_length=16, choices=IncidentStatusChoice.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Update on {self.incident_id} at {self.created_at:%Y-%m-%d %H:%M}"
