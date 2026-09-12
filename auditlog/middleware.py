"""
Sets the current-request user in a thread-local so model-level post_save
signals (auditlog.signals) can attribute actions to an actor without
needing the request object threaded through every call site.
"""

from .signals import set_current_user


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_user(self._resolve_user(request))
        try:
            response = self.get_response(request)
        finally:
            set_current_user(None)
        return response

    @staticmethod
    def _resolve_user(request):
        """Session users are already on request.user (AuthenticationMiddleware
        runs before us). JWT users are NOT — SimpleJWT authenticates inside
        DRF, after this middleware, so without the token fallback every
        API-driven action would be attributed to 'system'."""
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            return user

        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                from rest_framework_simplejwt.authentication import JWTAuthentication

                validated = JWTAuthentication().authenticate(request)
                if validated is not None:
                    return validated[0]
            except Exception:
                # Invalid/expired token: DRF will reject the request itself;
                # we just don't attribute it to anyone.
                return None
        return None
