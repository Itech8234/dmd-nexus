from django.contrib import admin

from .models import Report, ReportAttachment, ReportCategory


@admin.register(ReportCategory)
class ReportCategoryAdmin(admin.ModelAdmin):
    list_display = ("name",)


class AttachmentInline(admin.TabularInline):
    model = ReportAttachment
    extra = 0


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("polling_unit", "official", "category", "sync_status", "device_captured_at")
    list_filter = ("sync_status", "category")
    inlines = [AttachmentInline]
