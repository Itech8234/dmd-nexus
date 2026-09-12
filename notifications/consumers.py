from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """
    Personal notification stream: ws/notifications/?token=<JWT>
    One group per user (`user_<id>`), fed by notifications.services.notify().
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.group_name = f"user_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        # Sync the badge the moment the socket is up — this is what makes a
        # reconnect (or a laptop waking from sleep) converge instantly
        # without waiting for the client's next poll.
        await self.send_initial_badge(user)

    @database_sync_to_async
    def _unread_count(self, user):
        from .services import unread_count

        return unread_count(user)

    async def send_initial_badge(self, user):
        try:
            count = await self._unread_count(user)
            await self.send_json({"type": "badge_update", "unread_count": count})
        except Exception:
            # The DB read is a nicety here; the client also reconciles via
            # GET /api/v1/notifications/unread_count/ on reconnect.
            pass

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notify_push(self, event):
        await self.send_json({"type": "notification", **event["notification"], "unread_count": event.get("unread_count")})

    async def badge_update(self, event):
        """
        Real-time notification-bell refresh. Sent by the server whenever the
        recipient's unread-notification count changes (e.g. they just marked
        a conversation's messages read), so the overlay badge shrinks
        immediately instead of waiting for the client's next poll.
        """
        await self.send_json({"type": "badge_update", "unread_count": event["unread_count"]})

    async def notification_event(self, event):
        """Cross-device lifecycle sync: a notification was deleted or the
        stream was cleared on another tab/device of this user."""
        await self.send_json(
            {
                "type": "notification_event",
                "event": event["event"],
                "notification_id": event.get("notification_id", ""),
            }
        )


class OperationsFeedConsumer(AsyncJsonWebsocketConsumer):
    """
    Broadcast-only "something changed" signal for the command centre map
    and KPI tiles: ws/operations/?token=<JWT>. Deliberately carries no
    per-object data (only an event name) so it needs no per-connection
    scoping logic — clients just re-fetch from the already-scoped REST
    endpoints when they get a ping, instead of the server trying to work
    out what each connected user is allowed to see in real time.
    """

    GROUP_NAME = "operations_feed"

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def ops_event(self, event):
        await self.send_json({"type": "ops_event", "event": event["event"]})
