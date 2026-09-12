from django.utils import timezone
from rest_framework import serializers

from geography.models import OperationalStatus

from .models import Report, ReportAttachment, ReportCategory, SyncStatus


class ReportCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportCategory
        fields = ["id", "name", "description"]


class ReportAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportAttachment
        fields = ["id", "report", "file", "priority", "sync_status", "uploaded_at"]
        read_only_fields = ["sync_status", "uploaded_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        report = attrs.get("report")
        if request and report and not getattr(request.user, "is_privileged", False):
            from accounts.models import Role
            if request.user.role == Role.FIELD_OFFICIAL:
                if report.official.user_id != request.user.id:
                    raise serializers.ValidationError({"report": "You may only attach files to your own reports."})
        return attrs

    def create(self, validated_data):
        validated_data["sync_status"] = SyncStatus.SUBMITTED
        return ReportAttachment.objects.create(**validated_data)


class ReportSerializer(serializers.ModelSerializer):
    attachments = ReportAttachmentSerializer(many=True, read_only=True)
    polling_unit_code = serializers.CharField(source="polling_unit.official_code", read_only=True)
    official_name = serializers.CharField(source="official.user.get_full_name", read_only=True)
    polling_unit_status = serializers.CharField(source="polling_unit.operational_status", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Report
        fields = [
            "id", "client_generated_id", "polling_unit", "polling_unit_code", "official",
            "official_name", "category", "category_name", "operational_status",
            "polling_unit_status", "narrative", "device_captured_at",
            "server_received_at", "sync_status", "attachments", "created_at",
        ]
        read_only_fields = ["server_received_at", "sync_status", "created_at"]
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
            attrs["official"] = official
            polling_unit = attrs.get("polling_unit")
            if polling_unit and not official.assignments.filter(polling_unit=polling_unit, status="active").exists():
                raise serializers.ValidationError(
                    {"polling_unit": "You are not assigned to this polling unit."}
                )
        return attrs

    def create(self, validated_data):
        from django.db import IntegrityError

        official = validated_data["official"]
        client_id = validated_data["client_generated_id"]

        existing = Report.objects.filter(official=official, client_generated_id=client_id).first()
        if existing:
            return existing

        validated_data["server_received_at"] = timezone.now()
        validated_data["sync_status"] = SyncStatus.SUBMITTED
        try:
            report = Report.objects.create(**validated_data)
        except IntegrityError:
            existing = Report.objects.filter(official=official, client_generated_id=client_id).first()
            if existing:
                return existing
            raise

        pu = report.polling_unit
        pu.operational_status = OperationalStatus.RECENTLY_REPORTED
        pu.save(update_fields=["operational_status", "updated_at"])

        from notifications.services import broadcast_operations_event

        broadcast_operations_event("report_submitted")
        _notify_new_report(report)
        _record_sync(self.context.get("request"), "report", client_id, report.id)

        return report


def _notify_new_report(report):
    """Notify the relevant LGA coordinator when a new report arrives."""
    from accounts.models import Role, User
    from notifications.models import NotificationType
    from notifications.services import notify

    pu = report.polling_unit
    lga = pu.ward.lga
    coordinator = User.objects.filter(
        role=Role.LGA_COORDINATOR, scoped_lga=lga, is_active=True
    ).first()
    if coordinator:
        notify(
            coordinator,
            NotificationType.SYSTEM_ALERT,
            title=f"Report received — {pu.official_code}",
            body=f"A field report was submitted for {pu.name}.",
            related_object_type="report",
            related_object_id=report.id,
        )


def _record_sync(request, object_type, client_id, server_id):
    """Write a SyncRecord ledger entry when a device-submitted item lands."""
    if not request:
        return
    device_id = request.META.get("HTTP_X_YCOMPS_DEVICE_ID", "").strip()
    if not device_id:
        return
    from syncengine.models import SyncRecord, SyncRecordStatus
    from django.utils import timezone
    try:
        SyncRecord.objects.update_or_create(
            device_id=device_id,
            object_type=object_type,
            client_generated_id=client_id,
            defaults={
                "submitted_by": getattr(request, "user", None),
                "server_object_id": str(server_id),
                "status": SyncRecordStatus.SUCCEEDED,
                "attempt_count": 1,
                "resolved_at": timezone.now(),
            },
        )
    except Exception:
        pass
