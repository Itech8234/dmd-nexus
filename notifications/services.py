"""
Central helper for creating a Notification and pushing it over the
recipient's personal WebSocket group in the same call, so callers (Celery
tasks, viewsets, signal handlers) never have to touch Channels directly.

A Notification is delivered through three layers:
  1. DB row (the always-on source of truth — clients can always poll
     GET /api/v1/notifications/ to catch anything missed).
  2. Django Channels WebSocket push to the user's live `user_<id>` group
     (the real-time in-app nudge while the dashboard/field app is open).
  3. Firebase Cloud Messaging (FCM) device push — the notification-tray
     delivery for Android/iOS when the app is backgrounded or closed.

The WebSocket push is best-effort (a Redis/channel-layer outage never loses
a notification). The FCM push is likewise best-effort: if Firebase isn't
configured or a token is invalid we just log and move on.
"""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def unread_count(user):
    from .models import Notification

    return Notification.objects.filter(recipient=user, is_read=False).count()


def push_badge_update(user, count=None):
    """Push the recipient's current unread-notification count to their
    live WebSocket session so the UI notification bell stays in sync.

    Called after any action that can change the unread count: creating a
    notification (handled implicitly by the client on receipt) and — the
    part this closes — marking notifications or messages read. Without this
    push the bell overlay never shrinks until the client's next poll.
    """
    if count is None:
        count = unread_count(user)
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f"user_{user.id}",
            {"type": "badge_update", "unread_count": count},
        )
    except Exception:
        # A dead channel layer can't deliver a UI nudge; the DB is still
        # authoritative and the client reconciles on its next fetch.
        pass


def push_notification_event(user, event, notification_id=""):
    """Best-effort cross-device sync event for notification lifecycle changes
    (single delete, clear all). Clients remove rows locally so no stale
    notification survives on another tab/device of the same user."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f"user_{user.id}",
            {"type": "notification.event", "event": event, "notification_id": notification_id},
        )
    except Exception:
        pass


def notify(recipient, notification_type, title, body="", related_object_type="", related_object_id=""):
    from .models import Notification

    notification = Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=title,
        body=body,
        related_object_type=related_object_type,
        related_object_id=str(related_object_id) if related_object_id else "",
    )

    # The Notification row is the source of truth (a client can always poll
    # GET /api/v1/notifications/); the WebSocket push is a best-effort
    # real-time nudge on top of it. A Redis/channel-layer outage should
    # never cause a notification to be lost or crash the caller (e.g. the
    # overdue-report Celery task, which may be flagging many polling units
    # in one run).
    channel_layer = get_channel_layer()
    if channel_layer is not None:
        try:
            async_to_sync(channel_layer.group_send)(
                f"user_{recipient.id}",
                {
                    "type": "notify.push",
                    "notification": {
                        "id": str(notification.id),
                        "notification_type": notification.notification_type,
                        "title": notification.title,
                        "body": notification.body,
                        "related_object_type": notification.related_object_type,
                        "related_object_id": notification.related_object_id,
                        "is_read": notification.is_read,
                        "created_at": notification.created_at.isoformat(),
                    },
                    # Authoritative unread total rides along so every open
                    # client updates its badge instantly without a refetch.
                    "unread_count": unread_count(recipient),
                },
            )
        except Exception:
            pass

    # Push into the device notification tray (Android/iOS/Web) via FCM so
    # the user is alerted even when the dashboard isn't open. Best-effort:
    # if Firebase isn't configured this is a no-op.
    try:
        from fcm.client import send_push

        send_push(
            recipient,
            title=title,
            body=body,
            data={
                "notification_type": notification_type,
                "related_object_type": related_object_type or "",
                "related_object_id": str(related_object_id) if related_object_id else "",
                "notification_id": str(notification.id),
            },
        )
    except Exception:
        pass

    return notification


def notify_many(recipients, *args, **kwargs):
    return [notify(recipient, *args, **kwargs) for recipient in recipients]


def broadcast_operations_event(event_type: str):
    """
    Pings the command centre's live map/KPI feed that something changed
    (a report or incident came in, an SMS submission was approved, an
    overdue check ran). Carries no object data by design — see
    OperationsFeedConsumer. Best-effort: never raises, since a missed
    live-update ping just means the client falls back to its next
    scheduled refresh, not a lost report.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            "operations_feed",
            {"type": "ops.event", "event": event_type},
        )
    except Exception:
        pass
