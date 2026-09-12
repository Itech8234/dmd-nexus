from rest_framework import serializers

from geography.models import OperationalStatus

from .models import Incident, IncidentCategory, IncidentUpdate


class IncidentCategorySerializer(serializers.ModelSerializer):
    incident_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = IncidentCategory
        fields = ["id", "name", "description", "is_active", "incident_count", "created_at"]
        read_only_fields = ["created_at"]


class IncidentUpdateSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.get_full_name", read_only=True)

    class Meta:
        model = IncidentUpdate
        fields = ["id", "incident", "author", "author_name", "note", "new_status", "created_at"]
        read_only_fields = ["author", "created_at"]


class IncidentSerializer(serializers.ModelSerializer):
    updates = IncidentUpdateSerializer(many=True, read_only=True)
    polling_unit_code = serializers.CharField(source="polling_unit.official_code", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = Incident
        fields = [
            "id", "client_generated_id", "polling_unit", "polling_unit_code", "reporter",
            "category", "category_name", "severity", "description", "status", "assigned_admin",
            "resolution", "device_captured_at", "created_at", "updated_at", "updates",
        ]
        read_only_fields = ["created_at", "updated_at"]
        validators = []

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            return attrs
        user = request.user
        from accounts.models import Role

        if user.role == Role.FIELD_OFFICIAL:
            from officials.models import Official
            official = Official.objects.filter(user=user).first()
            if official is None:
                raise serializers.ValidationError("No official profile found for your account.")
            attrs["reporter"] = official
            polling_unit = attrs.get("polling_unit")
            if polling_unit and not official.assignments.filter(polling_unit=polling_unit, status="active").exists():
                raise serializers.ValidationError(
                    {"polling_unit": "You are not assigned to this polling unit."}
                )
        return attrs

    def create(self, validated_data):
        from django.db import IntegrityError

        client_id = validated_data.get("client_generated_id")
        reporter = validated_data.get("reporter")

        if client_id and reporter:
            existing = Incident.objects.filter(client_generated_id=client_id, reporter=reporter).first()
            if existing:
                return existing

        try:
            incident = Incident.objects.create(**validated_data)
        except IntegrityError:
            if client_id and reporter:
                existing = Incident.objects.filter(client_generated_id=client_id, reporter=reporter).first()
                if existing:
                    return existing
            raise

        pu = incident.polling_unit
        pu.operational_status = OperationalStatus.INCIDENT_REPORTED
        pu.save(update_fields=["operational_status", "updated_at"])

        from notifications.services import broadcast_operations_event

        broadcast_operations_event("incident_submitted")
        _notify_new_incident(incident)

        # Outbound SMS paging for critical incidents (best-effort; uses the
        # console backend until a real SMS gateway is configured).
        if incident.severity == "critical":
            from smsgateway.services import sms_alert_critical_incident

            try:
                sms_alert_critical_incident(incident)
            except Exception:
                pass

        return incident


def _notify_new_incident(incident):
    """Notify campaign admins + relevant LGA coordinator of a new incident."""
    from accounts.models import Role, User
    from notifications.models import NotificationType
    from notifications.services import notify

    pu = incident.polling_unit
    lga = pu.ward.lga
    severity_label = incident.get_severity_display()
    title = f"{'CRITICAL ' if incident.severity == 'critical' else ''}Incident reported — {pu.official_code}"

    recipients = list(User.objects.filter(
        role__in=[Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN], is_active=True
    ))
    lga_coord = User.objects.filter(
        role=Role.LGA_COORDINATOR, scoped_lga=lga, is_active=True
    ).first()
    if lga_coord:
        recipients.append(lga_coord)

    from notifications.services import notify_many
    notify_many(
        recipients,
        NotificationType.NEW_INCIDENT,
        title=title,
        body=f"{severity_label}: {incident.description[:120]}",
        related_object_type="incident",
        related_object_id=incident.id,
    )


class IncidentMapSerializer(serializers.ModelSerializer):
    """Slim geo feed for the operations map's incident layer."""

    polling_unit_code = serializers.CharField(source="polling_unit.official_code", read_only=True)
    polling_unit_name = serializers.CharField(source="polling_unit.name", read_only=True)
    latitude = serializers.CharField(source="polling_unit.latitude", read_only=True)
    longitude = serializers.CharField(source="polling_unit.longitude", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = Incident
        fields = [
            "id", "polling_unit", "polling_unit_code", "polling_unit_name",
            "latitude", "longitude", "category_name", "severity", "status",
            "description", "created_at",
        ]
