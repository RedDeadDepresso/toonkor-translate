import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import path
from django_backend.consumers import DownloadTranslateConsumer, QtConsumer

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "django_project.settings")

websocket_urlpatterns = [
    path(
        "ws/download_translate/<str:toonkor_id>/", DownloadTranslateConsumer.as_asgi()
    ),
    path("ws/qt/", QtConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),  # Handles traditional HTTP requests
        "websocket": AuthMiddlewareStack(  # Handles WebSocket connections
            URLRouter(websocket_urlpatterns)
        ),
    }
)
