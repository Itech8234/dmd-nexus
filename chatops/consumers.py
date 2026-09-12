import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone


class ConversationConsumer(AsyncJsonWebsocketConsumer):
    """
    One WebSocket group per conversation. Client connects to
    ws/chat/<conversation_id>/ after JWT auth (wired via middleware in
    ycomps/asgi.py) and sends/receives {"type": "message", "body": ...}
    frames. Offline-composed messages are instead pushed through the
    REST sync endpoint and broadcast here on arrival.
    """

    async def connect(self):
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.group_name = f"conversation_{self.conversation_id}"

        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        is_member = await self.is_conversation_member(user.id, self.conversation_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.mark_user_online(user.id)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        user = self.scope["user"]
        msg_type = content.get("type")

        if msg_type == "message":
            message = await self.save_message(user.id, self.conversation_id, content.get("body", ""), content.get("client_generated_id"))
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "chat.message",
                    "message": {
                        "id": str(message["id"]),
                        "sender": str(user.id),
                        "sender_name": user.get_full_name() or user.username,
                        "body": message["body"],
                        "created_at": message["created_at"],
                    },
                },
            )
            if message["created"]:
                # Only notify on a genuinely new message — a client retrying
                # the same client_generated_id (e.g. after a dropped ack)
                # would otherwise double-notify the recipient.
                await self.notify_members(message["id"])
        elif msg_type == "typing":
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "chat.typing", "user_id": str(user.id), "user_name": user.get_full_name() or user.username},
            )
        elif msg_type in ("call_offer", "call_answer", "call_ice", "call_end", "call_cancel"):
            # WebRTC video-call signaling relay. The payload is forwarded
            # verbatim to every other member of the conversation group (the
            # caller identifies itself via `caller_user_id`).
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "chat.signal",
                    "signal_type": msg_type,
                    "caller_user_id": str(user.id),
                    "caller_name": user.get_full_name() or user.username,
                    "payload": content.get("payload", {}),
                },
            )

    async def chat_message(self, event):
        await self.send_json({"type": "message", **event["message"]})

    async def chat_typing(self, event):
        if event["user_id"] != str(self.scope["user"].id):
            await self.send_json({"type": "typing", "user_id": event["user_id"], "user_name": event["user_name"]})

    async def chat_signal(self, event):
        if event["caller_user_id"] == str(self.scope["user"].id):
            return  # don't echo signalling back to the sender
        await self.send_json(
            {
                "type": event["signal_type"],
                "caller_user_id": event["caller_user_id"],
                "caller_name": event["caller_name"],
                "payload": event["payload"],
            }
        )

    @database_sync_to_async
    def is_conversation_member(self, user_id, conversation_id):
        from .models import ConversationMember

        return ConversationMember.objects.filter(conversation_id=conversation_id, user_id=user_id).exists()

    @database_sync_to_async
    def save_message(self, sender_id, conversation_id, body, client_generated_id):
        from .models import Message

        if client_generated_id:
            message, created = Message.objects.get_or_create(
                sender_id=sender_id,
                conversation_id=conversation_id,
                client_generated_id=client_generated_id,
                defaults={"body": body, "delivered_at": timezone.now()},
            )
        else:
            message = Message.objects.create(
                sender_id=sender_id, conversation_id=conversation_id, body=body, delivered_at=timezone.now()
            )
            created = True
        return {"id": message.id, "body": message.body, "created_at": message.created_at.isoformat(), "created": created}

    @database_sync_to_async
    def notify_members(self, message_id):
        from .models import Message
        from .services import notify_conversation_members

        message = Message.objects.select_related("sender", "conversation").get(id=message_id)
        notify_conversation_members(message)

    @database_sync_to_async
    def mark_user_online(self, user_id):
        from accounts.models import User

        User.objects.filter(id=user_id).update(last_seen_at=timezone.now())
