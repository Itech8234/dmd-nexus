import uuid

from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    REPORT_OVERDUE = "report_overdue", "Report Overdue"
    NEW_INCIDENT = "new_incident", "New Incident"
    SYNC_COMPLETE = "sync_complete", "Synchronization Complete"
    SYSTEM_ALERT = "system_alert", "System Alert"
    MESSAGE = "message", "New Message"
    ASSIGNMENT_CHANGED = "assignment_changed", "Assignment Changed"
    PU_REQUEST_SUBMITTED = "pu_request_submitted", "Polling Unit Request Submitted"
    PU_REQUEST_DECIDED = "pu_request_decided", "Polling Unit Request Decision"


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    notification_type = models.CharField(max_length=32, choices=NotificationType.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)

    related_object_type = models.CharField(max_length=50, blank=True, help_text="e.g. 'incident', 'report'")
    related_object_id = models.CharField(max_length=64, blank=True)

    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "is_read"])]

    def __str__(self):
        return f"{self.notification_type} -> {self.recipient}"


class DevicePlatform(models.TextChoices):
    ANDROID = "android", "Android"
    IOS = "ios", "iOS"
    WEB = "web", "Web"


class NotificationDevice(models.Model):
    """
    A user's push-transport credential (FCM token).

    Multiple per user are expected: a user may have an Android phone and a
    tablet, for example. Tokens are registered by the client app after it
    obtains a Firebase Instance / FCM token of its own, and they're used by
    ``notifications.services.notify`` to push a notification into the device
    notification tray even when the WebSocket connection isn't reachable.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_devices"
    )
    fcm_token = models.CharField(max_length=512, unique=True, help_text="Firebase Cloud Messaging token")
    device_id = models.CharField(max_length=255, blank=True, help_text="Client-chosen device identifier")
    platform = models.CharField(
        max_length=16, choices=DevicePlatform.choices, default=DevicePlatform.ANDROID
    )
    is_active = models.BooleanField(default=True, help_text="Deactivated when FCM reports the token invalid.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["platform"]),
        ]

    def __str__(self):
        return f"{self.get_platform_display()} device for {self.user}"
