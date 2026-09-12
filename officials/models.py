import uuid

from django.conf import settings
from django.db import models


class Official(models.Model):
    """
    Field-operations profile for a user assigned to Y-COMPS field duty.
    Not every User needs one (admins/coordinators typically don't), but
    every Assignment points to an Official.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="official_profile")
    official_reference = models.CharField(max_length=40, unique=True, help_text="Internal field-official ID")
    id_verified = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.official_reference} — {self.user.get_full_name() or self.user.username}"


class AssignmentStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ENDED = "ended", "Ended"
    SUSPENDED = "suspended", "Suspended"


class Assignment(models.Model):
    """Links a field Official to a specific PollingUnit for an operational period."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    official = models.ForeignKey(Official, on_delete=models.CASCADE, related_name="assignments")
    polling_unit = models.ForeignKey(
        "geography.PollingUnit", on_delete=models.CASCADE, related_name="assignments"
    )
    status = models.CharField(max_length=16, choices=AssignmentStatus.choices, default=AssignmentStatus.ACTIVE)

    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="assignments_made"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-assigned_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["polling_unit"],
                condition=models.Q(status="active"),
                name="one_active_official_per_polling_unit",
            )
        ]

    def __str__(self):
        return f"{self.official} @ {self.polling_unit} ({self.status})"
