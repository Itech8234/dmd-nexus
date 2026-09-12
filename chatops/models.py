import uuid

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    is_group = models.BooleanField(default=False)
    title = models.CharField(max_length=150, blank=True, help_text="Only used for group conversations")

    class MemberPolicy(models.TextChoices):
        MANUAL = "manual", "Manual (members chosen explicitly)"
        AUTO_ALL = "auto_all", "All active users (auto-add & keep in sync)"

    member_policy = models.CharField(
        max_length=20,
        choices=MemberPolicy.choices,
        default=MemberPolicy.MANUAL,
        help_text="How members are determined. AUTO_ALL adds every active user automatically and keeps them in sync.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"Conversation {self.id}"


class ConversationMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversation_memberships")
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("conversation", "user")


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_generated_id = models.UUIDField(null=True, blank=True, help_text="For offline-composed messages, dedup on sync")

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="messages_sent")
    body = models.TextField(blank=True)
    attachment = models.FileField(upload_to="chat_attachments/%Y/%m/", null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "client_generated_id"],
                name="unique_client_message_per_conversation",
            )
        ]

    def __str__(self):
        return f"Message {self.id} in {self.conversation_id}"


class MessageReadReceipt(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="read_receipts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="message_reads")
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")
