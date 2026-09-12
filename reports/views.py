from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsPrivileged, scope_queryset_to_user
from accounts.models import Role

from .models import Report, ReportAttachment, ReportCategory
from .serializers import ReportAttachmentSerializer, ReportCategorySerializer, ReportSerializer


class ReportCategoryViewSet(viewsets.ModelViewSet):
    queryset = ReportCategory.objects.all()
    serializer_class = ReportCategorySerializer
    # Small lookup list consumed as a bare array by the field forms.
    pagination_class = None

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        from accounts.permissions import IsPrivileged
        return [IsPrivileged()]


class ReportViewSet(viewsets.ModelViewSet):
    serializer_class = ReportSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["polling_unit", "official", "sync_status", "category"]
    search_fields = ["narrative", "polling_unit__official_code", "polling_unit__name"]
    ordering_fields = ["created_at", "device_captured_at", "server_received_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = Report.objects.select_related("polling_unit__ward__lga", "official__user").prefetch_related("attachments")
        user = self.request.user
        if user.role == Role.FIELD_OFFICIAL:
            return qs.filter(official__user=user)
        return scope_queryset_to_user(
            user, qs, lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
        )

    def get_permissions(self):
        if self.action in ("list", "retrieve", "create"):
            return [IsAuthenticated()]
        return [IsPrivileged()]


class ReportAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = ReportAttachmentSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["uploaded_at"]

    def get_queryset(self):
        qs = ReportAttachment.objects.select_related("report")
        user = self.request.user
        if user.role == Role.FIELD_OFFICIAL:
            return qs.filter(report__official__user=user)
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve", "create"):
            return [IsAuthenticated()]
        return [IsPrivileged()]
