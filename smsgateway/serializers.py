from rest_framework import serializers

from .models import InboundSmsMessage, PendingSmsSubmission


class InboundSmsMessageSerializer(serializers.ModelSerializer):
    official_name = serializers.CharField(source="matched_official.user.get_full_name", read_only=True)

    class Meta:
        model = InboundSmsMessage
        fields = [
            "id", "sender_phone", "body", "gateway_provider", "matched_official",
            "official_name", "parse_result", "parse_note", "received_at",
        ]
        read_only_fields = fields


class PendingSmsSubmissionSerializer(serializers.ModelSerializer):
    official_name = serializers.CharField(source="official.user.get_full_name", read_only=True)
    polling_unit_code = serializers.CharField(source="polling_unit.official_code", read_only=True)
    raw_message = serializers.CharField(source="source_message.body", read_only=True)

    class Meta:
        model = PendingSmsSubmission
        fields = [
            "id", "submission_type", "polling_unit", "polling_unit_code", "official", "official_name",
            "payload", "assignment_mismatch", "status", "reviewed_by", "review_note",
            "resulting_object_id", "raw_message", "created_at", "reviewed_at",
        ]
        read_only_fields = [
            "submission_type", "polling_unit", "polling_unit_code", "official", "official_name",
            "payload", "assignment_mismatch", "status", "reviewed_by", "resulting_object_id",
            "raw_message", "created_at", "reviewed_at",
        ]
