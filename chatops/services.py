"""
Notifies the other members of a conversation when a message arrives, so
someone who isn't actively looking at the chat screen still finds out —
mirrors the pattern in notifications.services.notify(), and is called
from both the REST create path (chatops/views.py) and the live WebSocket
path (chatops/consumers.py) so neither route to sending a message skips it.
"""


def notify_conversation_members(message):
    from notifications.models import NotificationType
    from notifications.services import notify_many

    recipients = [
        member.user
        for member in message.conversation.members.select_related("user").all()
        if member.user_id != message.sender_id
    ]
    if not recipients:
        return

    sender_name = message.sender.get_full_name() or message.sender.username
    preview = (message.body or "")[:120]

    notify_many(
        recipients,
        NotificationType.MESSAGE,
        title=f"New message from {sender_name}",
        body=preview,
        related_object_type="conversation",
        related_object_id=message.conversation_id,
    )
