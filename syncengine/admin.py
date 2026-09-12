from django.contrib import admin

from .models import SyncRecord


@admin.register(SyncRecord)
class SyncRecordAdmin(admin.ModelAdmin):
    list_display = ("object_type", "client_generated_id", "device_id", "status", "attempt_count", "submitted_at")
    list_filter = ("status", "object_type")
