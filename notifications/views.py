from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification, NotificationDevice
from .serializers import NotificationDeviceSerializer, NotificationSerializer
from .services import push_badge_update, push_notification_event


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    The caller's own notifications.

    Every action is scoped to ``recipient=request.user`` — a user can never
    list, read, or delete someone else's notification (the queryset is the
    authorisation boundary, enforced server-side, not by the frontend).
    """

    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        # The shells compute the bell badge from ?unread=true&page_size=1 —
        # honour the filter so `count` is the real unread total.
        unread = (self.request.query_params.get("unread") or "").lower()
        if unread in ("1", "true", "yes"):
            qs = qs.filter(is_read=False)
        return qs

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        # Shrink the notification bell in real time for whoever read it.
        push_badge_update(request.user)
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        push_badge_update(request.user, count=0)
        return Response({"marked_read": updated})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        """Authoritative unread total for bell badges (single COUNT query)."""
        return Response({"unread_count": self.get_queryset().filter(is_read=False).count()})

    @action(detail=False, methods=["post"])
    def clear_all(self, request):
        """
        Permanently delete every notification belonging to the caller.
        Destructive (the UI asks for confirmation) — distinct from
        mark_all_read which only flips the read flag.
        """
        deleted, _ = self.get_queryset().delete()
        push_badge_update(request.user, count=0)
        # Keep any other open tabs/devices of this user in sync.
        push_notification_event(request.user, "notifications_cleared")
        return Response({"deleted": deleted})

    def destroy(self, request, *args, **kwargs):
        notification = self.get_object()
        notification.delete()
        push_badge_update(request.user)
        # Other tabs/devices drop the row too (dedupe on the client by id).
        push_notification_event(request.user, "notification_deleted", str(notification.id))
        return Response(status=204)


class NotificationDeviceViewSet(viewsets.GenericViewSet):
    """
    Register / list the caller's own FCM device tokens.

    Clients POST their Firebase token after login so the server can push
    notifications into the Android/iOS notification tray when the app is
    backgrounded. Tokens are upserted (a rotating token never duplicates
    a device row), and a client can list/clean its own tokens.
    """

    serializer_class = NotificationDeviceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NotificationDevice.objects.filter(user=self.request.user)

    def list(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)

    @action(detail=False, methods=["post"])
    def register(self, request):
        """Idempotent token registration endpoint."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)

    @action(detail=False, methods=["post", "delete"], url_path="delete-token")
    def delete_token(self, request):
        """Remove a token (e.g. on logout / app uninstall)."""
        token = request.data.get("fcm_token") or request.query_params.get("fcm_token")
        if not token:
            return Response({"detail": "fcm_token is required."}, status=400)
        deleted, _ = NotificationDevice.objects.filter(
            user=request.user, fcm_token=token
        ).delete()
        return Response({"deleted": deleted})
