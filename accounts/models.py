import uuid

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Role(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super Administrator"
    CAMPAIGN_ADMIN = "campaign_admin", "Campaign Administrator"
    LGA_COORDINATOR = "lga_coordinator", "LGA Coordinator"
    WARD_COORDINATOR = "ward_coordinator", "Ward/Area Coordinator"
    FIELD_OFFICIAL = "field_official", "Field Official"


class YcompsUserManager(UserManager):
    """
    `role` is a separate concept from Django's built-in is_staff/
    is_superuser (those control Django admin access; `role` controls
    access to the Y-COMPS API and dashboards via IsPrivileged etc.).
    Without this override, `createsuperuser` would produce an account
    that can do anything in /admin/ but gets 403 from every privileged
    API endpoint — a confusing first-run trap for whoever stands this
    system up. A superuser is, by definition, meant to have full access,
    so it defaults to Role.SUPER_ADMIN unless explicitly overridden.
    """

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", Role.SUPER_ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """
    Custom user for Y-COMPS. Every authorized platform user (admin,
    coordinator or field official) is represented here; the specific
    field-operations profile lives in officials.Official (one-to-one)
    for users whose role is FIELD_OFFICIAL and who are assigned to
    physical locations.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.FIELD_OFFICIAL)
    phone_number = models.CharField(max_length=20, blank=True)

    # Geographic scoping - an LGA Coordinator is scoped to one LGA, a Ward
    # Coordinator to one Ward. Null for state-level roles (super admin /
    # campaign admin) who see everything.
    scoped_lga = models.ForeignKey(
        "geography.LGA", null=True, blank=True, on_delete=models.SET_NULL, related_name="coordinators"
    )
    scoped_ward = models.ForeignKey(
        "geography.Ward", null=True, blank=True, on_delete=models.SET_NULL, related_name="coordinators"
    )

    is_active_field_user = models.BooleanField(default=True)
    mfa_enabled = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    objects = YcompsUserManager()

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"

    @property
    def is_privileged(self):
        return self.role in (Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN)

    @property
    def online_status(self):
        if not self.last_seen_at:
            return "offline"
        from django.utils import timezone

        delta = timezone.now() - self.last_seen_at
        return "online" if delta.total_seconds() < 120 else "offline"
