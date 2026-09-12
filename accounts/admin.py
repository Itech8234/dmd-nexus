from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class YcompsUserAdmin(UserAdmin):
    list_display = ("username", "get_full_name", "role", "scoped_lga", "scoped_ward", "is_active_field_user", "is_active")
    list_filter = ("role", "is_active_field_user", "is_active")
    fieldsets = UserAdmin.fieldsets + (
        ("Y-COMPS", {"fields": ("role", "phone_number", "scoped_lga", "scoped_ward", "is_active_field_user", "mfa_enabled")}),
    )
