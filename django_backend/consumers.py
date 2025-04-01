import json

from channels.generic.websocket import AsyncWebsocketConsumer

from django_backend.cleaner import cleaner
from django_backend.downloader import downloader
from django_backend.models import StatusChoices, encode_name


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
        to_translate = event["to_translate"]
        await self.send(json.dumps(to_translate))

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
                "chapters": [{"index": chapter, "status": "Translated"}],
                "progress": {},
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

    async def receive(self, text_data):
        """
        Receives data from the WebSocket client, starts the download process for the specified chapters,
        and optionally triggers the translation process.

        Args:
            text_data (str): JSON string containing the task, manhwa toonkor_id, and chapters to download.
        """
        data = json.loads(text_data)
        task = data["task"]
        chapters = data["chapters"]
        if task == "remove":
            remove_choices = data["remove_choices"]
            await self.run_remove(chapters, remove_choices)
        else:
            await self.run_download_translate(task, chapters)

    async def run_download_translate(self, task, chapters):
        progress = {"current": 0, "total": len(chapters)}
        for chapter in chapters:
            chapter["download_status"] = StatusChoices.LOADING.value
            if task == "download_translate":
                chapter["translation_status"] = StatusChoices.LOADING.value

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "send_progress",
                "chapters": chapters,
                "progress": progress,
            },
        )
        downloader.append(self.manhwa_id, self.group_name, task, chapters)

    async def run_remove(self, chapters, remove_choices):
        for chapter in chapters:
            if remove_choices["downloaded"]:
                chapter["download_status"] = StatusChoices.REMOVING.value

            if remove_choices["translated"]:
                chapter["translation_status"] = StatusChoices.REMOVING.value

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "send_progress",
                "chapters": chapters,
                "progress": {},
            },
        )
        cleaner.append(self.manhwa_id, self.group_name, chapters, remove_choices)

    async def send_progress(self, event):
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
