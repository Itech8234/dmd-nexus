from django.contrib import admin

from .models import LGA, PollingUnit, State, Ward


@admin.register(State)
class StateAdmin(admin.ModelAdmin):
    list_display = ("name", "code")


@admin.register(LGA)
class LGAAdmin(admin.ModelAdmin):
    list_display = ("name", "state", "code")
    list_filter = ("state",)


@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    list_display = ("name", "lga")
    list_filter = ("lga__state", "lga")


@admin.register(PollingUnit)
class PollingUnitAdmin(admin.ModelAdmin):
    list_display = ("official_code", "name", "ward", "operational_status", "data_version")
    list_filter = ("operational_status", "ward__lga")
    search_fields = ("official_code", "name")
