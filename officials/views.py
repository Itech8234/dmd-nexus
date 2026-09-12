from django.db import IntegrityError
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.models import Role
from accounts.permissions import IsCoordinatorOrAbove, IsPrivileged, ReadOnlyOrCoordinatorAbove, scope_queryset_to_user

from .models import Assignment, Official
from .serializers import AssignmentSerializer, OfficialSerializer


class OfficialViewSet(viewsets.ModelViewSet):
    queryset = Official.objects.select_related("user").all()
    serializer_class = OfficialSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsCoordinatorOrAbove()]
        return [IsPrivileged()]


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes = [ReadOnlyOrCoordinatorAbove]
    filterset_fields = ["status", "polling_unit", "official"]

    def get_queryset(self):
        qs = Assignment.objects.select_related("official__user", "polling_unit__ward__lga").all()
        user = self.request.user
        if user.role == Role.FIELD_OFFICIAL:
            return qs.filter(official__user=user)
        return scope_queryset_to_user(
            user, qs, lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
        )

    def perform_create(self, serializer):
        assignment = serializer.save(assigned_by=self.request.user)
        _notify_assignment(assignment)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
        except IntegrityError:
            return Response(
                {"detail": "This polling unit already has an active official assigned. End the current assignment first."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], permission_classes=[IsCoordinatorOrAbove])
    def assignment_options(self, request):
        """Candidates for building an assignment in one round-trip.

        Returns the field officials who can be assigned and the polling units
        (within the current user's geographic scope) that could receive one,
        so the dashboard can render its assign form without paginating the
        big geography/official lists. Polling units carry a flag for whether
        they already have an active official, so the UI can sort unassigned
        units first and show a clear reason when a reassign would 409.
        """
        from accounts.models import User as UserModel
        from geography.models import PollingUnit

        # Field officials = users with an Official profile (excluding roles
        # that shouldn't be handed field duty in the dropdown).
        officials_qs = UserModel.objects.filter(
            role=Role.FIELD_OFFICIAL, official_profile__isnull=False, is_active=True
        ).select_related("official_profile")
        officials = [
            {
                "id": str(o.official_profile.id),
                "official_reference": o.official_profile.official_reference,
                "full_name": o.get_full_name() or o.username,
            }
            for o in officials_qs.order_by("username")
        ]

        pu_qs = scope_queryset_to_user(
            request.user,
            PollingUnit.objects.select_related("ward__lga"),
            lga_field="ward__lga",
            ward_field="ward",
        )
        # Track current active assignment per PU for a single small query.
        active = {
            a.polling_unit_id: a
            for a in Assignment.objects.filter(status="active", polling_unit__in=pu_qs).select_related("official__user")
        }
        polling_units = [
            {
                "id": str(pu.id),
                "official_code": pu.official_code,
                "name": pu.name,
                "ward_name": pu.ward.name,
                "lga_name": pu.ward.lga.name,
                "assigned_official": (
                    {
                        "id": str(active[pu.id].official_id),
                        "name": active[pu.id].official.user.get_full_name() or active[pu.id].official.user.username,
                    }
                    if pu.id in active
                    else None
                ),
            }
            for pu in pu_qs.order_by("ward__lga__name", "ward__name", "name")
        ]

        return Response({"officials": officials, "polling_units": polling_units})


def _notify_assignment(assignment):
    """Notify the assigned official's user when an assignment is created."""
    from notifications.models import NotificationType
    from notifications.services import notify

    user = assignment.official.user
    notify(
        user,
        NotificationType.ASSIGNMENT_CHANGED,
        title="New assignment",
        body=f"You have been assigned to polling unit {assignment.polling_unit.official_code}.",
        related_object_type="assignment",
        related_object_id=assignment.id,
    )
