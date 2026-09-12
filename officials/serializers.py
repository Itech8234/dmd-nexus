from rest_framework import serializers

from .models import Assignment, Official


class OfficialSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = Official
        fields = ["id", "user", "full_name", "official_reference", "id_verified", "notes", "created_at"]


class AssignmentSerializer(serializers.ModelSerializer):
    official_name = serializers.CharField(source="official.user.get_full_name", read_only=True)
    polling_unit_code = serializers.CharField(source="polling_unit.official_code", read_only=True)
    official_reference = serializers.CharField(source="official.official_reference", read_only=True)

    class Meta:
        model = Assignment
        fields = [
            "id", "official", "official_name", "official_reference", "polling_unit", "polling_unit_code",
            "status", "assigned_by", "assigned_at", "ended_at",
        ]
        read_only_fields = ["assigned_by", "assigned_at"]
