from rest_framework import serializers

from .models import Notification, NotificationDevice


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id", "notification_type", "title", "body",
            "related_object_type", "related_object_id", "is_read", "created_at",
        ]
        read_only_fields = fields


class NotificationDeviceSerializer(serializers.ModelSerializer):
    """
    Register (or refresh) a client's FCM token.

    `fcm_token` is the only required field; if a token for this user already
    exists it is upserted (so rotating tokens doesn't create duplicates), and
    the platform/device_id are updated to reflect the latest client.
    """

    class Meta:
        model = NotificationDevice
        fields = [
            "id", "user", "fcm_token", "device_id", "platform",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["user", "is_active", "created_at", "updated_at"]
        # Drop the automatic UniqueValidator on fcm_token: uniqueness is
        # handled by the upsert in create() below, so a client re-registering
        # (or rotating) its token gets a 201 refresh instead of a 400.
        extra_kwargs = {"fcm_token": {"validators": []}}

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request else None
        validated_data.setdefault("user", user)
        token = validated_data.get("fcm_token")
        if token:
            obj, _ = NotificationDevice.objects.update_or_create(
                fcm_token=token,
                defaults={"user": user, **{k: v for k, v in validated_data.items() if k != "fcm_token"}},
            )
            return obj
        return NotificationDevice.objects.create(**validated_data)
