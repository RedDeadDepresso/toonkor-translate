import json

from channels.generic.websocket import AsyncWebsocketConsumer

from django_backend.models import encode_name
from django_backend.schemas import ProgressSchema


class QtConsumer(AsyncWebsocketConsumer):
    """
    QtConsumer is an AsyncWebsocketConsumer responsible for managing a WebSocket
    connection that handles the translation process. It interacts with the comic_django
    GUI and listens for translation requests.

    Attributes:
        COMIC_TRANSLATE_PROC (multiprocessing.Process): A process to run the comic_django GUI.
    """

    async def connect(self):
        """
        Handles a new WebSocket connection. Adds the connection to the 'qt' group
        and starts the comic_django GUI process. Accepts the WebSocket connection.
        """
        self.group_name = "qt"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def send_translation_request(self, event):
        """
        Sends a translation request event to the WebSocket client.

        Args:
            event (dict): The event data containing the text_data to be sent.
        """
        await self.send("Translate")

    async def receive(self, text_data):
        """
        Receives data from the WebSocket client, processes the translation request,
        updates the chapter status in the database, and triggers the download/translate process.

        Args:
            text_data (str): JSON string containing the manhwa toonkor_id and chapter index.
        """
        data = json.loads(text_data)
        toonkor_id = data["toonkor_id"]
        chapter = int(data["chapter"])
        group = f"download_translate_{encode_name(toonkor_id)}"
        await self.channel_layer.group_send(
            group,
            {
                "type": "send_progress",
                "chapters": [{"index": chapter}],
            },
        )

    async def disconnect(self, close_code):
        """
        Handles the disconnection of the WebSocket client by removing it from the 'qt' group.

        Args:
            close_code (int): The WebSocket close code.
        """
        await self.channel_layer.group_discard(self.group_name, self.channel_name)


class DownloadTranslateConsumer(AsyncWebsocketConsumer):
    """
    DownloadTranslateConsumer is an AsyncWebsocketConsumer responsible for managing
    the download and translation tasks. It listens for download/translate requests,
    manages the downloading of chapters, and communicates progress back to the client.

    Attributes:
        group_name (str): The name of the channel group for managing download and translation tasks.
    """

    async def connect(self):
        """
        Handles a new WebSocket connection. Adds the connection to the 'download_translate' group
        and accepts the WebSocket connection.
        """
        self.manhwa_id = "/" + self.scope["url_route"]["kwargs"]["toonkor_id"]
        self.group_name = f"download_translate_{encode_name(self.manhwa_id)}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def send_progress(self, event: ProgressSchema):
        """
        Sends progress updates to the WebSocket client.

        Args:
            event (dict): The event data containing progress information.
        """
        await self.send(text_data=json.dumps(event))

    async def disconnect(self, close_code):
        """
        Handles the disconnection of the WebSocket client by removing it from the 'download_translate' group.

        Args:
            close_code (int): The WebSocket close code.
        """
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
