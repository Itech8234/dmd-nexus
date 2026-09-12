from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsPrivileged
from .models import Conversation, ConversationMember, Message
from .serializers import ConversationSerializer, MessageSerializer
from .services import notify_conversation_members


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Conversation.objects.filter(members__user=self.request.user)
            .distinct()
            .prefetch_related("members__user")
        )

    def get_permissions(self):
        """
        Group conversations are admin/coordinator-only ("created by admin");
        1:1 direct lookups are open to any authenticated user. Actions that
        declare their own permission_classes on the @action decorator
        (broadcast, sync_members -> IsPrivileged) are honoured here too —
        without the last branch those declarations would be silently
        ignored by this override.
        """
        if self.action == "create":
            is_group = self.request.data.get("is_group")
            if is_group in (True, "true", "1"):
                return [IsPrivileged()]
        return [permission() for permission in self.permission_classes]

    @action(detail=False, methods=["post"])
    def direct(self, request):
        other_user_id = request.data.get("user_id")
        if not other_user_id:
            return Response({"detail": "user_id is required"}, status=400)

        existing = (
            Conversation.objects.filter(is_group=False, members__user=request.user)
            .filter(members__user_id=other_user_id)
            .distinct()
            .first()
        )
        if existing:
            return Response(ConversationSerializer(existing, context={"request": request}).data)

        from django.contrib.auth import get_user_model

        User = get_user_model()
        if str(other_user_id) == str(request.user.id):
            return Response({"detail": "You cannot start a conversation with yourself."}, status=400)
        if not User.objects.filter(id=other_user_id, is_active=True).exists():
            return Response({"detail": "Recipient not found."}, status=404)

        conversation = Conversation.objects.create(is_group=False)
        ConversationMember.objects.create(conversation=conversation, user=request.user)
        ConversationMember.objects.create(conversation=conversation, user_id=other_user_id)
        return Response(ConversationSerializer(conversation, context={"request": request}).data, status=201)

    @action(detail=False, methods=["post"], permission_classes=[IsPrivileged])
    def broadcast(self, request):
        """
        Create (or reuse) a group conversation that automatically contains
        every active user — i.e. the "all officials in one group chat"
        broadcast channel. Idempotent: posting the same title twice returns
        the existing group instead of duplicating it.
        """
        title = (request.data.get("title") or "All Officials").strip()
        existing = Conversation.objects.filter(
            is_group=True, member_policy=Conversation.MemberPolicy.AUTO_ALL, title=title
        ).first()
        if existing:
            return Response(ConversationSerializer(existing, context={"request": request}).data)

        from django.contrib.auth import get_user_model

        User = get_user_model()
        conversation = Conversation.objects.create(
            is_group=True, title=title, member_policy=Conversation.MemberPolicy.AUTO_ALL
        )
        for user in User.objects.filter(is_active=True):
            ConversationMember.objects.get_or_create(conversation=conversation, user=user)
        return Response(ConversationSerializer(conversation, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[IsPrivileged])
    def sync_members(self, request, pk=None):
        """Reconcile an AUTO_ALL group's membership with the current active users."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        conversation = self.get_object()
        if conversation.member_policy != Conversation.MemberPolicy.AUTO_ALL:
            return Response(
                {"detail": "This conversation does not use auto-all membership."},
                status=400,
            )
        active_ids = set(User.objects.filter(is_active=True).values_list("id", flat=True))
        current_ids = set(conversation.members.values_list("user_id", flat=True))
        added = 0
        for uid in active_ids - current_ids:
            ConversationMember.objects.get_or_create(conversation=conversation, user_id=uid)
            added += 1
        removed = conversation.members.filter(
            user_id__in=list(current_ids - active_ids)
        ).delete()[0]
        return Response(
            {
                "synced": True,
                "total_members": conversation.members.count(),
                "added": added,
                "removed": removed,
            }
        )

    @action(detail=False, methods=["get"])
    def contacts(self, request):
        """
        People the current user is allowed to message. Field officials see
        their coordinators + campaign admins; coordinators/admin see all
        active users (their own admin surface is scoped by role anyway).
        """
        from django.contrib.auth import get_user_model

        from accounts.models import Role
        from accounts.serializers import UserSerializer

        User = get_user_model()
        qs = User.objects.filter(is_active=True).exclude(
            id=request.user.id
        ).select_related("scoped_lga", "scoped_ward")
        if request.user.role == Role.FIELD_OFFICIAL:
            qs = qs.filter(
                role__in=[
                    Role.SUPER_ADMIN,
                    Role.CAMPAIGN_ADMIN,
                    Role.LGA_COORDINATOR,
                    Role.WARD_COORDINATOR,
                    Role.FIELD_OFFICIAL,
                ]
            )
            if request.user.scoped_lga_id:
                qs = qs.filter(scoped_lga_id=request.user.scoped_lga_id) | qs.filter(
                    role__in=[Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN]
                )
            return Response(UserSerializer(qs.distinct(), many=True).data)
        return Response(UserSerializer(qs.distinct(), many=True).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        Lightweight counts for the notification bell / chat widgets on every
        dashboard (admin, coordinator and field shells alike). One aggregate
        query computes, per conversation, the messages sent by others after
        this user's last_read_at (all of them when never read).
        """
        from django.db.models import Count, F, Q

        unread_rows = (
            Message.objects.filter(
                Q(conversation__members__user=request.user)
                & (
                    Q(conversation__members__last_read_at__isnull=True)
                    | Q(created_at__gt=F("conversation__members__last_read_at"))
                )
            )
            .exclude(sender=request.user)
            .values("conversation_id")
            .annotate(unread=Count("id"))
        )
        per_conversation = {str(row["conversation_id"]): row["unread"] for row in unread_rows}

        from notifications.services import unread_count as notification_unread

        return Response(
            {
                "unread_messages_total": sum(per_conversation.values()),
                "unread_by_conversation": per_conversation,
                "unread_notifications": notification_unread(request.user),
                "total_conversations": Conversation.objects.filter(
                    members__user=request.user
                ).count(),
            }
        )

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        conversation = self.get_object()
        now = timezone.now()
        ConversationMember.objects.filter(
            conversation=conversation, user=request.user
        ).update(last_read_at=now)

        # Reading the conversation's messages also marks the related
        # "New Message" notifications read, so the notification bell
        # shrinks in real time (not just the per-thread unread count).
        from notifications.models import Notification
        from notifications.services import push_badge_update

        Notification.objects.filter(
            recipient=request.user,
            notification_type="message",
            related_object_type="conversation",
            related_object_id=str(conversation.id),
        ).update(is_read=True)
        push_badge_update(request.user)
        return Response({"marked_read": True})


class MessageViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = MessageSerializer
    filterset_fields = ["conversation"]

    def get_queryset(self):
        return (
            Message.objects.filter(conversation__members__user=self.request.user)
            .select_related("sender")
            .distinct()
        )

    def perform_create(self, serializer):
        conversation = serializer.validated_data.get("conversation")
        if not ConversationMember.objects.filter(
            conversation=conversation, user=self.request.user
        ).exists():
            raise ValidationError({"conversation": "You are not a member of this conversation."})

        from django.db import IntegrityError

        client_id = serializer.validated_data.get("client_generated_id")
        if client_id:
            existing = Message.objects.filter(
                conversation=conversation, client_generated_id=client_id
            ).first()
            if existing:
                serializer.instance = existing
                return

        try:
            message = serializer.save(sender=self.request.user)
        except IntegrityError:
            existing = (
                Message.objects.filter(
                    conversation=conversation, client_generated_id=client_id
                ).first()
                if client_id
                else None
            )
            if existing:
                message = existing
            else:
                raise

        channel_layer = get_channel_layer()
        if channel_layer is not None:
            try:
                async_to_sync(channel_layer.group_send)(
                    f"conversation_{message.conversation_id}",
                    {
                        "type": "chat.message",
                        "message": {
                            "id": str(message.id),
                            "sender": str(message.sender_id),
                            "sender_name": self.request.user.get_full_name()
                            or self.request.user.username,
                            "body": message.body,
                            "created_at": message.created_at.isoformat(),
                        },
                    },
                )
            except Exception:
                pass

        notify_conversation_members(message)
