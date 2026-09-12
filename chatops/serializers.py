from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Conversation, ConversationMember, Message

User = get_user_model()


class ConversationMemberSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = ConversationMember
        fields = ["id", "user", "user_name", "username", "joined_at", "last_read_at"]
        read_only_fields = ["joined_at"]


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.get_full_name", read_only=True)
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "client_generated_id", "conversation", "sender", "sender_name",
            "body", "attachment", "attachment_url", "created_at", "delivered_at",
        ]
        read_only_fields = ["sender", "created_at", "delivered_at"]
        # Dedup on (conversation, client_generated_id) is handled explicitly in
        # create() below (mirrors reports/incidents), not by an auto validator.
        validators = []

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get("request")
        url = obj.attachment.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def create(self, validated_data):
        from django.utils import timezone

        client_id = validated_data.get("client_generated_id")
        if client_id:
            existing = Message.objects.filter(
                conversation=validated_data["conversation"], client_generated_id=client_id
            ).first()
            if existing:
                return existing
        validated_data["delivered_at"] = timezone.now()
        return Message.objects.create(**validated_data)


class ConversationSerializer(serializers.ModelSerializer):
    members = ConversationMemberSerializer(many=True, read_only=True)
    member_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, write_only=True, required=False
    )
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    partner_name = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "is_group", "title", "created_at", "members", "member_ids",
            "member_policy", "last_message", "unread_count", "partner_name",
        ]
        read_only_fields = ["created_at"]

    def get_partner_name(self, obj):
        """For direct conversations, the display name of the other member."""
        request = self.context.get("request")
        if obj.is_group:
            return obj.title or "Group chat"
        if not request or not request.user.is_authenticated:
            return "Direct chat"
        for m in obj.members.all():
            if m.user_id != request.user.id:
                return m.user.get_full_name() or m.user.username
        return "Direct chat"

    def get_last_message(self, obj):
        from django.conf import settings

        msg = obj.messages.order_by("-created_at").first()
        if not msg:
            return None
        out = {
            "body": msg.body,
            "sender_name": msg.sender.get_full_name() or msg.sender.username,
            "created_at": msg.created_at,
            "has_attachment": bool(msg.attachment),
        }
        if msg.attachment:
            request = self.context.get("request")
            out["attachment_url"] = f"{settings.MEDIA_URL}{msg.attachment}" if not request else request.build_absolute_uri(msg.attachment.url)
            out["attachment_name"] = msg.attachment.name.split("/")[-1]
        return out

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return 0
        membership = None
        for m in obj.members.all():
            if m.user_id == request.user.id:
                membership = m
                break
        if not membership:
            return 0
        qs = obj.messages.exclude(sender=request.user)
        if membership.last_read_at:
            qs = qs.filter(created_at__gt=membership.last_read_at)
        return qs.count()

    def create(self, validated_data):
        member_policy = validated_data.pop("member_policy", Conversation.MemberPolicy.MANUAL)
        member_users = validated_data.pop("member_ids", [])
        conversation = Conversation.objects.create(member_policy=member_policy, **validated_data)
        request = self.context.get("request")
        all_members = set(member_users)
        if request and request.user.is_authenticated:
            all_members.add(request.user)
        # AUTO_ALL groups automatically include every active user.
        if member_policy == Conversation.MemberPolicy.AUTO_ALL:
            all_members.update(User.objects.filter(is_active=True))
        for user in all_members:
            ConversationMember.objects.get_or_create(conversation=conversation, user=user)
        return conversation

    def update(self, instance, validated_data):
        member_policy = validated_data.pop("member_policy", None)
        member_users = validated_data.pop("member_ids", None)
        if member_policy is not None:
            instance.member_policy = member_policy
            instance.save(update_fields=["member_policy"])
            # Reconcile membership when switching policies.
            if member_policy == Conversation.MemberPolicy.AUTO_ALL:
                _sync_auto_all(instance)
        if member_users is not None:
            current = set(instance.members.values_list("user_id", flat=True))
            wanted = {u.id for u in member_users}
            if instance.is_group:
                for uid in wanted - current:
                    ConversationMember.objects.get_or_create(conversation=instance, user_id=uid)
                instance.members.filter(user_id__in=list(current - wanted)).delete()
        return instance


def _sync_auto_all(conversation):
    """Ensure an AUTO_ALL conversation contains exactly the active users."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    active_ids = set(User.objects.filter(is_active=True).values_list("id", flat=True))
    current_ids = set(conversation.members.values_list("user_id", flat=True))
    for uid in active_ids - current_ids:
        ConversationMember.objects.get_or_create(conversation=conversation, user_id=uid)
    for uid in current_ids - active_ids:
        conversation.members.filter(user_id=uid).delete()
