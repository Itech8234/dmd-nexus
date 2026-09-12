from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsCoordinatorOrAbove, IsPrivileged, scope_queryset_to_user

from .models import Incident, IncidentCategory, IncidentUpdate
from .serializers import (
    IncidentCategorySerializer,
    IncidentMapSerializer,
    IncidentSerializer,
    IncidentUpdateSerializer,
)


class IncidentCategoryViewSet(viewsets.ModelViewSet):
    """
    Manageable incident taxonomy.

    GET    /incident-categories/          any authenticated user (read, active-first)
    POST   /incident-categories/          privileged only
    PATCH  /incident-categories/{id}/     privileged only (rename, activate/deactivate)
    DELETE /incident-categories/{id}/     privileged only — blocked while in use
    """

    serializer_class = IncidentCategorySerializer
    # Small lookup list consumed as a bare array by the field forms.
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        qs = IncidentCategory.objects.annotate(
            incident_count=Count("incidents", distinct=True)
        )
        # The incident-creation forms only want active categories; the admin
        # panel passes ?include_inactive=1 to manage the full taxonomy.
        if not self.request.query_params.get("include_inactive"):
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsPrivileged()]

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.incidents.exists():
            raise ValidationError(
                {"detail": "This category is used by existing incidents and cannot be deleted. Deactivate it instead — historical incidents keep their category."}
            )
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IncidentViewSet(viewsets.ModelViewSet):
    serializer_class = IncidentSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "severity", "polling_unit"]
    ordering_fields = ["created_at", "updated_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = Incident.objects.select_related("polling_unit__ward__lga", "reporter__user").prefetch_related("updates")
        user = self.request.user
        if user.role == Role.FIELD_OFFICIAL:
            return qs.filter(reporter__user=user)
        return scope_queryset_to_user(
            user, qs, lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
        )

    def get_permissions(self):
        if self.action in ("list", "retrieve", "create"):
            return [IsAuthenticated()]
        return [IsCoordinatorOrAbove()]

    @action(detail=False, methods=["get"])
    def map(self, request):
        """Geo feed for the operations map's incident layer (>= medium severity)."""
        qs = (
            self.filter_queryset(self.get_queryset())
            .select_related("polling_unit", "category")
            .exclude(polling_unit__latitude__isnull=True)
            .exclude(polling_unit__longitude__isnull=True)
            .order_by("-created_at")
        )
        page = self.paginate_queryset(qs)
        serializer = IncidentMapSerializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsCoordinatorOrAbove])
    def add_update(self, request, pk=None):
        incident = self.get_object()
        serializer = IncidentUpdateSerializer(data={**request.data, "incident": incident.id})
        serializer.is_valid(raise_exception=True)
        serializer.save(author=request.user)

        new_status = request.data.get("new_status")
        if new_status:
            incident.status = new_status
            incident.save(update_fields=["status", "updated_at"])

            from notifications.models import NotificationType
            from notifications.services import notify, broadcast_operations_event
            broadcast_operations_event("incident_status_changed")

            if incident.assigned_admin_id:
                notify(
                    incident.assigned_admin,
                    NotificationType.SYSTEM_ALERT,
                    title=f"Incident status changed — {incident.polling_unit.official_code}",
                    body=f"Incident status changed to {incident.get_status_display()}.",
                    related_object_type="incident",
                    related_object_id=incident.id,
                )

        return Response(IncidentSerializer(incident).data)
