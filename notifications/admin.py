from django.contrib import admin

from .models import Notification, NotificationDevice


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "notification_type", "title", "is_read", "created_at")
    list_filter = ("notification_type", "is_read")


@admin.register(NotificationDevice)
class NotificationDeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "device_id", "is_active", "updated_at")
    list_filter = ("platform", "is_active")
    search_fields = ("fcm_token", "device_id", "user__username")
    raw_id_fields = ("user",)
