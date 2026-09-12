import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ycomps.settings")

django_asgi_app = get_asgi_application()

from accounts.jwt_ws_auth import JWTAuthMiddleware  # noqa: E402
from chatops.routing import websocket_urlpatterns as chat_ws_urlpatterns  # noqa: E402
from notifications.routing import websocket_urlpatterns as notification_ws_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JWTAuthMiddleware(
            URLRouter(chat_ws_urlpatterns + notification_ws_urlpatterns)
        ),
    }
)
