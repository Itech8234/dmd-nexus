"""
Shared DRF permission classes implementing Y-COMPS's role-based access
and geographic scoping model.
"""

from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role


class IsPrivileged(BasePermission):
    """Super Admin or Campaign Administrator only."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_privileged)


class IsCoordinatorOrAbove(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN, Role.LGA_COORDINATOR, Role.WARD_COORDINATOR)
        )


class ReadOnlyOrCoordinatorAbove(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Role.SUPER_ADMIN, Role.CAMPAIGN_ADMIN, Role.LGA_COORDINATOR, Role.WARD_COORDINATOR)
        )


def scope_queryset_to_user(user, queryset, lga_field="ward__lga", ward_field="ward"):
    """
    Applies geographic scoping for coordinators: an LGA Coordinator only
    sees objects under their LGA; a Ward Coordinator only sees objects
    under their Ward. Privileged/field roles are returned unscoped (field
    officials should already be filtered to their own assignment upstream).

    A coordinator without a scope sees nothing (safer than seeing everything).
    """
    if user.role == Role.LGA_COORDINATOR:
        if user.scoped_lga_id:
            return queryset.filter(**{lga_field: user.scoped_lga_id})
        return queryset.none()
    if user.role == Role.WARD_COORDINATOR:
        if user.scoped_ward_id:
            return queryset.filter(**{ward_field: user.scoped_ward_id})
        return queryset.none()
    return queryset
