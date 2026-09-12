from django.contrib import admin

from .models import Conversation, ConversationMember, Message


class MemberInline(admin.TabularInline):
    model = ConversationMember
    extra = 0


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "is_group", "created_at")
    inlines = [MemberInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "sender", "created_at")
