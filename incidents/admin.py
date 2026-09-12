from django.contrib import admin

from .models import Incident, IncidentCategory, IncidentUpdate


class UpdateInline(admin.TabularInline):
    model = IncidentUpdate
    extra = 0


@admin.register(IncidentCategory)
class IncidentCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "incident_count", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    list_editable = ("is_active",)

    @admin.display(description="Incidents")
    def incident_count(self, obj):
        return obj.incidents.count()


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ("polling_unit", "severity", "status", "assigned_admin", "created_at")
    list_filter = ("severity", "status")
    inlines = [UpdateInline]
