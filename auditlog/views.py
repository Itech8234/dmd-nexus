from rest_framework import mixins, viewsets

from accounts.permissions import IsPrivileged

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only audit log, restricted to privileged users."""

    queryset = AuditLog.objects.select_related("actor").all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsPrivileged]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    filterset_fields = ["action", "object_type", "result"]
