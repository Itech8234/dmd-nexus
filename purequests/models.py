import uuid

from django.conf import settings
from django.db import models


class RequestStatus(models.TextChoices):
    PENDING = "pending", "Pending Review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"


class PollingUnitRequest(models.Model):
    """
    A proposal for a new official Polling Unit raised from the field.

    Lifecycle: proposed (status=pending) -> reviewed by a privileged admin
    -> approved (materialises as a real geography.PollingUnit, linked via
    created_polling_unit, so it immediately joins the command-centre map
    and registry) or rejected (with a mandatory note). A submitter may
    withdraw their own still-pending request.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ward = models.ForeignKey("geography.Ward", on_delete=models.CASCADE, related_name="pu_requests")

    official_code = models.CharField(max_length=40, help_text="Proposed official INEC PU reference/code")
    name = models.CharField(max_length=200)
    location_description = models.TextField(blank=True)

    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    status = models.CharField(max_length=16, choices=RequestStatus.choices, default=RequestStatus.PENDING)
    source_note = models.CharField(max_length=255, blank=True, help_text="e.g. 'Field survey by assigned official'")

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="pu_requests_submitted"
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="pu_requests_reviewed"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    # Populated when the request is approved — the link back to the official
    # record this proposal became.
    created_polling_unit = models.ForeignKey(
        "geography.PollingUnit", null=True, blank=True, on_delete=models.SET_NULL, related_name="originating_requests"
    )

    class Meta:
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["official_code"]),
        ]

    def __str__(self):
        return f"{self.official_code} — {self.name} ({self.get_status_display()})"

    @property
    def lga(self):
        return self.ward.lga

    @property
    def state(self):
        return self.ward.lga.state