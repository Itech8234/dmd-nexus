from rest_framework import serializers

from .models import Role, User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "email", "phone_number",
            "role", "scoped_lga", "scoped_ward", "is_active_field_user", "online_status",
        ]
        read_only_fields = ["role", "online_status"]


class UserAdminSerializer(serializers.ModelSerializer):
    """
    Used by admins/coordinators to onboard new platform users — a plain
    UserSerializer intentionally can't set role/password, since a user
    should never be able to elevate their own role through /me/.
    """

    password = serializers.CharField(write_only=True, required=False, min_length=10)
    official_reference = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "email", "phone_number",
            "role", "scoped_lga", "scoped_ward", "is_active_field_user", "is_active",
            "online_status", "password", "official_reference", "created_at",
        ]
        read_only_fields = ["online_status", "created_at"]

    def create(self, validated_data):
        from officials.models import Official

        password = validated_data.pop("password", None)
        official_reference = validated_data.pop("official_reference", "")

        # Prevent non-super-admins from creating super-admin accounts.
        request = self.context.get("request")
        target_role = validated_data.get("role", "")
        if target_role == Role.SUPER_ADMIN and request and not getattr(request.user, "role", "") == Role.SUPER_ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only a Super Admin can create Super Admin accounts.")

        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        if user.role == Role.FIELD_OFFICIAL and not hasattr(user, "official_profile"):
            Official.objects.create(
                user=user,
                official_reference=official_reference or f"FO-{str(user.id)[:8].upper()}",
            )

        # Deliver credentials to the user's registered email immediately
        # (best-effort — never fails the create on a mail misconfiguration).
        if user.email and password:
            from .emails import send_credentials_email
            send_credentials_email(user, password)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        validated_data.pop("official_reference", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        # If an admin reset the password, email the new credentials too.
        if instance.email and password:
            from .emails import send_password_reset_email
            send_password_reset_email(instance, password)
        return instance
