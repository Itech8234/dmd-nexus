import uuid

from django.db import models


class State(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class LGA(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name="lgas")
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("state", "name")

    def __str__(self):
        return f"{self.name} LGA"


class Ward(models.Model):
    """Ward / Registration Area."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lga = models.ForeignKey(LGA, on_delete=models.CASCADE, related_name="wards")
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("lga", "name")

    def __str__(self):
        return f"{self.name} Ward, {self.lga.name}"


class OperationalStatus(models.TextChoices):
    ACTIVE_REPORTING = "active_reporting", "Active / Reporting"
    RECENTLY_REPORTED = "recently_reported", "Recently Reported"
    REPORT_OVERDUE = "report_overdue", "Report Overdue"
    INCIDENT_REPORTED = "incident_reported", "Incident Reported"
    AWAITING_ASSIGNMENT = "awaiting_assignment", "Awaiting Assignment"
    OFFICIAL_OFFLINE = "official_offline", "Official Offline"


class PollingUnit(models.Model):
    """
    Electoral geography leaf node. A data-versioned record so authoritative
    dataset updates (e.g. a new INEC release) can be tracked over time
    without silently overwriting operational history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name="polling_units")

    official_code = models.CharField(max_length=40, unique=True, help_text="Official INEC PU reference/code")
    name = models.CharField(max_length=200)
    location_description = models.TextField(blank=True)

    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    operational_status = models.CharField(
        max_length=32, choices=OperationalStatus.choices, default=OperationalStatus.AWAITING_ASSIGNMENT
    )

    data_version = models.PositiveIntegerField(default=1)
    source_note = models.CharField(
        max_length=255, blank=True, help_text="e.g. 'INEC RA/PU list, 2026 release'"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["ward__lga__name", "ward__name", "name"]
        indexes = [
            models.Index(fields=["operational_status"]),
            models.Index(fields=["official_code"]),
        ]

    def __str__(self):
        return f"{self.official_code} — {self.name}"

    @property
    def lga(self):
        return self.ward.lga

    @property
    def state(self):
        return self.ward.lga.state
