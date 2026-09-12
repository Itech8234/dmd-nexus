from django.contrib import admin

from .models import Assignment, Official


@admin.register(Official)
class OfficialAdmin(admin.ModelAdmin):
    list_display = ("official_reference", "user", "id_verified")
    search_fields = ("official_reference", "user__username")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("official", "polling_unit", "status", "assigned_by", "assigned_at")
    list_filter = ("status",)
