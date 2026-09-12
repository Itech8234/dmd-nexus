from rest_framework import serializers

from accounts.models import Role
from geography.models import PollingUnit

from .models import PollingUnitRequest, RequestStatus


class PollingUnitRequestSerializer(serializers.ModelSerializer):
    """Read/represent shape for list + detail."""

    ward_name = serializers.CharField(source="ward.name", read_only=True)
    lga = serializers.PrimaryKeyRelatedField(source="ward.lga", read_only=True)
    lga_name = serializers.CharField(source="ward.lga.name", read_only=True)
    submitted_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    created_polling_unit_code = serializers.CharField(source="created_polling_unit.official_code", read_only=True)

    class Meta:
        model = PollingUnitRequest
        fields = [
            "id", "ward", "ward_name", "lga", "lga_name", "official_code", "name",
            "location_description", "latitude", "longitude", "source_note", "status",
            "submitted_by", "submitted_by_name", "submitted_at",
            "reviewed_by", "reviewed_by_name", "reviewed_at", "review_note",
            "created_polling_unit", "created_polling_unit_code",
        ]

    def _display_name(self, user):
        if not user:
            return ""
        return user.get_full_name() or user.username

    def get_submitted_by_name(self, obj):
        return self._display_name(obj.submitted_by)

    def get_reviewed_by_name(self, obj):
        return self._display_name(obj.reviewed_by)


class PollingUnitRequestCreateSerializer(serializers.ModelSerializer):
    """
    Creation payload for a new PU proposal. Enforces:
      - a non-empty official code,
      - GPS coordinates (mandatory — the whole point of a field proposal),
      - uniqueness against the official registry and other open requests,
      - geographic scoping for coordinators.
    """

    class Meta:
        model = PollingUnitRequest
        fields = ["ward", "official_code", "name", "location_description", "latitude", "longitude", "source_note"]
        extra_kwargs = {
            "ward": {"required": True},
            "name": {"required": True, "max_length": 200},
            "official_code": {"required": True, "max_length": 40},
            "latitude": {"required": True, "min_value": -90, "max_value": 90},
            "longitude": {"required": True, "min_value": -180, "max_value": 180},
            "location_description": {"required": False, "allow_blank": True},
            "source_note": {"required": False, "allow_blank": True, "max_length": 255},
        }

    def validate_official_code(self, value):
        code = (value or "").strip()
        if not code:
            raise serializers.ValidationError("Official code is required.")
        return code

    def validate(self, attrs):
        code = attrs["official_code"]
        ward = attrs["ward"]
        user = self.context.get("request").user

        if PollingUnit.objects.filter(official_code=code).exists():
            raise serializers.ValidationError(
                {"official_code": "An official polling unit with this code already exists."}
            )
        if PollingUnitRequest.objects.filter(official_code=code, status=RequestStatus.PENDING).exists():
            raise serializers.ValidationError(
                {"official_code": "A pending request with this code already exists."}
            )

        # Coordinators may only propose units within their geographic scope.
        if user.role == Role.LGA_COORDINATOR:
            if not user.scoped_lga_id or ward.lga_id != user.scoped_lga_id:
                raise serializers.ValidationError(
                    {"ward": "You can only propose polling units within your scoped LGA."}
                )
        elif user.role == Role.WARD_COORDINATOR:
            if not user.scoped_ward_id or ward.id != user.scoped_ward_id:
                raise serializers.ValidationError(
                    {"ward": "You can only propose polling units within your scoped ward."}
                )
        return attrs


class PollingUnitRequestMapSerializer(serializers.ModelSerializer):
    """Slim payload for pending-request markers on the operations map."""

    class Meta:
        model = PollingUnitRequest
        fields = ["id", "official_code", "name", "latitude", "longitude", "status"]