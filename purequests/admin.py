from django.contrib import admin

from .models import PollingUnitRequest


@admin.register(PollingUnitRequest)
class PollingUnitRequestAdmin(admin.ModelAdmin):
    list_display = ("official_code", "name", "ward", "status", "submitted_by", "submitted_at", "reviewed_by")
    list_filter = ("status", "ward__lga")
    search_fields = ("official_code", "name", "submitted_by__username")
    readonly_fields = ("submitted_at", "reviewed_at", "created_polling_unit")
    date_hierarchy = "submitted_at"