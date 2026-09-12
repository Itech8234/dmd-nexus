from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsPrivileged, scope_queryset_to_user

from .models import PollingUnitRequest, RequestStatus
from .serializers import (
    PollingUnitRequestCreateSerializer,
    PollingUnitRequestMapSerializer,
    PollingUnitRequestSerializer,
)
from .services import audit_request_action, notify_new_request, review_request


class PollingUnitRequestViewSet(viewsets.ModelViewSet):
    """
    Field proposals for new polling units.

      GET    /pu-requests/            list (scoped)
      POST   /pu-requests/            submit a proposal (any authenticated user)
      GET    /pu-requests/{id}/       detail
      DELETE /pu-requests/{id}/       withdraw (owner, while pending)
      POST   /pu-requests/{id}/approve/   privileged only
      POST   /pu-requests/{id}/reject/    privileged only (note required)
      GET    /pu-requests/map/        pending proposals for the operations map
    """

    serializer_class = PollingUnitRequestSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_fields = ["status", "ward", "ward__lga"]
    ordering_fields = ["submitted_at", "reviewed_at"]
    ordering = ["-submitted_at"]
    search_fields = ["official_code", "name"]
    # No PUT/PATCH: proposals are immutable — decisions happen via approve/reject.
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = PollingUnitRequest.objects.select_related(
            "ward__lga", "submitted_by", "reviewed_by", "created_polling_unit"
        )
        user = self.request.user
        if user.role == Role.FIELD_OFFICIAL:
            qs = qs.filter(submitted_by=user)
        return scope_queryset_to_user(user, qs, lga_field="ward__lga", ward_field="ward")

    def get_permissions(self):
        # NOTE: get_permissions() overrides the @action permission_classes,
        # so review endpoints must be listed here explicitly.
        if self.action in ("approve", "reject"):
            return [IsPrivileged()]
        # Everything else any authenticated user (object-level rules live in
        # perform_destroy / the review service).
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return PollingUnitRequestCreateSerializer
        if self.action == "map":
            return PollingUnitRequestMapSerializer
        return PollingUnitRequestSerializer

    def create(self, request, *args, **kwargs):
        # DRF would re-serialise the response with get_serializer_class(),
        # i.e. the input-validators-only CreateSerializer. Respond with the
        # full read shape instead so clients get id/status back.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        req = serializer.save(submitted_by=request.user)
        notify_new_request(req)
        output = PollingUnitRequestSerializer(req, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.submitted_by_id != user.id and not user.is_privileged:
            raise PermissionDenied("You can only withdraw your own requests.")
        if instance.status != RequestStatus.PENDING:
            raise ValidationError({"detail": "Only pending requests can be withdrawn."})
        instance.status = RequestStatus.WITHDRAWN
        instance.save(update_fields=["status"])
        audit_request_action(instance, user, "pu_request_withdrawn")

    @action(detail=True, methods=["post"], permission_classes=[IsPrivileged])
    def approve(self, request, pk=None):
        return self._review(request, RequestStatus.APPROVED)

    @action(detail=True, methods=["post"], permission_classes=[IsPrivileged])
    def reject(self, request, pk=None):
        return self._review(request, RequestStatus.REJECTED)

    def _review(self, request, decision):
        req = self.get_object()
        updated = review_request(req, request.user, decision, note=request.data.get("note", ""))
        return Response(PollingUnitRequestSerializer(updated).data)

    @action(detail=False, methods=["get"])
    def map(self, request):
        qs = (
            self.filter_queryset(self.get_queryset())
            .filter(status=RequestStatus.PENDING)
            .exclude(latitude__isnull=True)
        )
        page = self.paginate_queryset(qs)
        serializer = PollingUnitRequestMapSerializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)