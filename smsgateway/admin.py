from django.contrib import admin

from .models import InboundSmsMessage, PendingSmsSubmission


@admin.register(InboundSmsMessage)
class InboundSmsMessageAdmin(admin.ModelAdmin):
    list_display = ("sender_phone", "matched_official", "parse_result", "received_at")
    list_filter = ("parse_result",)
    readonly_fields = [f.name for f in InboundSmsMessage._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(PendingSmsSubmission)
class PendingSmsSubmissionAdmin(admin.ModelAdmin):
    list_display = ("submission_type", "official", "polling_unit", "status", "assignment_mismatch", "created_at")
    list_filter = ("status", "submission_type", "assignment_mismatch")
