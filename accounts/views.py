from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import viewsets

from .models import Role, User
from .permissions import IsCoordinatorOrAbove, IsPrivileged
from .serializers import UserAdminSerializer, UserSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin-facing user management — onboarding field officials, coordinators,
    etc. Read access is available to coordinators+ (so an LGA coordinator
    can see who's in their area); creating, editing, or deactivating an
    account is restricted to Super Admin / Campaign Admin, since role
    assignment is a privileged action.
    """

    serializer_class = UserAdminSerializer
    filterset_fields = ["role", "is_active_field_user", "is_active"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsCoordinatorOrAbove()]
        return [IsPrivileged()]

    def get_queryset(self):
        # Not geography-scoped like other resources: a user's own
        # scoped_lga/scoped_ward only applies to coordinators, while a
        # field official's effective area comes from their Assignment ->
        # PollingUnit chain instead, so a naive scope on this model would
        # incorrectly hide field officials from LGA coordinators. Read
        # access here is already gated to coordinator-and-above in
        # get_permissions(), which is the relevant boundary for this view.
        return User.objects.select_related("scoped_lga", "scoped_ward").all()
