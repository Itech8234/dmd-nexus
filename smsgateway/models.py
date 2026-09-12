import uuid

from django.conf import settings
from django.db import models


class ParseResult(models.TextChoices):
    PARSED = "parsed", "Parsed"
    UNPARSEABLE = "unparseable", "Could not parse message format"
    UNKNOWN_SENDER = "unknown_sender", "Sender phone not linked to a field official"
    UNKNOWN_POLLING_UNIT = "unknown_polling_unit", "Polling unit code not recognized"


class InboundSmsMessage(models.Model):
    """
    Raw log of every inbound SMS hitting the gateway webhook, kept
    regardless of whether it could be parsed/matched — this is the primary
    audit trail for the emergency-reporting fallback channel (proposal §14).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender_phone = models.CharField(max_length=20)
    body = models.TextField()
    gateway_message_id = models.CharField(max_length=100, blank=True, help_text="Provider's own message ID, if given")
    gateway_provider = models.CharField(max_length=50, blank=True)

    matched_official = models.ForeignKey(
        "officials.Official", on_delete=models.SET_NULL, null=True, blank=True, related_name="sms_messages"
    )
    parse_result = models.CharField(max_length=32, choices=ParseResult.choices)
    parse_note = models.CharField(max_length=255, blank=True)

    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-received_at"]
        indexes = [models.Index(fields=["sender_phone"]), models.Index(fields=["parse_result"])]

    def __str__(self):
        return f"SMS from {self.sender_phone} at {self.received_at:%Y-%m-%d %H:%M}"


class SubmissionType(models.TextChoices):
    REPORT = "report", "Report"
    INCIDENT = "incident", "Incident"


class PendingSubmissionStatus(models.TextChoices):
    PENDING = "pending", "Pending Review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class PendingSmsSubmission(models.Model):
    """
    An SMS-origin report/incident awaiting admin review before it becomes a
    real Report/Incident. Per the proposal, SMS is a fallback channel, not
    a trusted direct-write path — every item here needs a human to approve
    it (or reject it) before it counts as an official submission.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_message = models.OneToOneField(InboundSmsMessage, on_delete=models.CASCADE, related_name="pending_submission")

    submission_type = models.CharField(max_length=16, choices=SubmissionType.choices)
    polling_unit = models.ForeignKey("geography.PollingUnit", on_delete=models.CASCADE, related_name="sms_pending_submissions")
    official = models.ForeignKey("officials.Official", on_delete=models.CASCADE, related_name="sms_pending_submissions")

    payload = models.JSONField(help_text="Normalized fields ready to become a Report/Incident on approval")
    assignment_mismatch = models.BooleanField(
        default=False, help_text="True if the sending official has no active assignment to the stated polling unit"
    )

    status = models.CharField(max_length=16, choices=PendingSubmissionStatus.choices, default=PendingSubmissionStatus.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="sms_reviews")
    review_note = models.CharField(max_length=255, blank=True)
    resulting_object_id = models.CharField(max_length=64, blank=True, help_text="ID of the Report/Incident created on approval")

    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"SMS {self.submission_type} from {self.official} — {self.status}"
