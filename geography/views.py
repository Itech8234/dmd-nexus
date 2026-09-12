from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import ReadOnlyOrCoordinatorAbove, scope_queryset_to_user

from .models import LGA, PollingUnit, State, Ward
from .serializers import (
    LGASerializer,
    PollingUnitMapSerializer,
    PollingUnitSerializer,
    StateSerializer,
    WardSerializer,
)


class StateViewSet(viewsets.ModelViewSet):
    queryset = State.objects.all()
    serializer_class = StateSerializer
    permission_classes = [ReadOnlyOrCoordinatorAbove]
    # Reference lists are consumed as bare arrays by the frontend.
    pagination_class = None


class LGAViewSet(viewsets.ModelViewSet):
    queryset = LGA.objects.select_related("state").all()
    serializer_class = LGASerializer
    permission_classes = [ReadOnlyOrCoordinatorAbove]
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["state"]


class WardViewSet(viewsets.ModelViewSet):
    queryset = Ward.objects.select_related("lga").all()
    serializer_class = WardSerializer
    permission_classes = [ReadOnlyOrCoordinatorAbove]
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["lga"]


class PollingUnitViewSet(viewsets.ModelViewSet):
    serializer_class = PollingUnitSerializer
    permission_classes = [ReadOnlyOrCoordinatorAbove]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["operational_status", "ward", "ward__lga"]
    search_fields = ["official_code", "name"]
    ordering_fields = ["name", "official_code", "created_at", "updated_at"]
    ordering = ["ward__lga__name", "ward__name", "name"]

    def get_queryset(self):
        from accounts.models import Role

        qs = PollingUnit.objects.select_related("ward__lga__state").all()
        user = self.request.user
        if user.role == Role.FIELD_OFFICIAL:
            return qs.filter(assignments__official__user=user, assignments__status="active").distinct()
        return scope_queryset_to_user(user, qs, lga_field="ward__lga", ward_field="ward")

    @action(detail=False, methods=["get"])
    def map(self, request):
        """Slim GeoJSON-ish feed for the interactive operations map."""
        qs = self.filter_queryset(self.get_queryset()).exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        return Response(PollingUnitMapSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def coverage_summary(self, request):
        """Counts by operational_status - powers command-centre KPI tiles."""
        qs = self.filter_queryset(self.get_queryset())
        summary = {}
        for choice_value, _label in PollingUnit._meta.get_field("operational_status").choices:
            summary[choice_value] = qs.filter(operational_status=choice_value).count()
        summary["total"] = qs.count()
        return Response(summary)
