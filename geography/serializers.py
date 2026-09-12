from rest_framework import serializers

from .models import LGA, PollingUnit, State, Ward


class StateSerializer(serializers.ModelSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "code"]


class LGASerializer(serializers.ModelSerializer):
    class Meta:
        model = LGA
        fields = ["id", "state", "name", "code"]


class WardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ward
        fields = ["id", "lga", "name", "code"]


class PollingUnitSerializer(serializers.ModelSerializer):
    lga_name = serializers.CharField(source="ward.lga.name", read_only=True)
    ward_name = serializers.CharField(source="ward.name", read_only=True)
    assigned_official = serializers.SerializerMethodField()
    latest_report_at = serializers.SerializerMethodField()

    class Meta:
        model = PollingUnit
        fields = [
            "id", "ward", "ward_name", "lga_name", "official_code", "name",
            "location_description", "latitude", "longitude", "operational_status",
            "data_version", "source_note", "assigned_official", "latest_report_at",
            "updated_at",
        ]

    def get_assigned_official(self, obj):
        active = obj.assignments.filter(status="active").select_related("official__user").first()
        if not active:
            return None
        return {
            "official_id": str(active.official_id),
            "name": active.official.user.get_full_name() or active.official.user.username,
        }

    def get_latest_report_at(self, obj):
        latest = obj.reports.order_by("-device_captured_at").first()
        return latest.device_captured_at if latest else None


class PollingUnitMapSerializer(serializers.ModelSerializer):
    """Slim payload for the GIS map view - avoids N+1-heavy detail fields."""

    ward_name = serializers.CharField(source="ward.name", read_only=True)
    lga_name = serializers.CharField(source="ward.lga.name", read_only=True)

    class Meta:
        model = PollingUnit
        fields = [
            "id", "official_code", "name", "latitude", "longitude",
            "operational_status", "ward_name", "lga_name", "location_description",
        ]
