from django.urls import re_path

from .consumers import NotificationConsumer, OperationsFeedConsumer

websocket_urlpatterns = [
    re_path(r"ws/notifications/$", NotificationConsumer.as_asgi()),
    re_path(r"ws/operations/$", OperationsFeedConsumer.as_asgi()),
]
