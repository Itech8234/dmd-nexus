"""
Channels middleware that authenticates WebSocket connections using the
same JWT access token issued by the REST API (passed as ?token=... on
the ws:// URL, since browsers can't set custom headers on the WS
handshake).
"""

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken
from urllib.parse import parse_qs


@database_sync_to_async
def get_user_from_token(token):
    from .models import User

    try:
        validated = AccessToken(token)
        user = User.objects.get(id=validated["user_id"], is_active=True)
        return user
    except (InvalidToken, TokenError, User.DoesNotExist, KeyError):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = parse_qs(scope.get("query_string", b"").decode())
        token = query_string.get("token", [None])[0]
        scope["user"] = await get_user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
