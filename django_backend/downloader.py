import threading
from collections import deque

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.forms.models import model_to_dict

from django_backend.models import Chapter, StatusChoices
from django_backend.toonkor_api import toonkor_api
from django_backend.utils import start_comic_proc


class Downloader:
    def __init__(self):
        self._queue = deque()
        self._thread = None
        self._channel_layer = get_channel_layer()
        self._comic_proc = None

    def start(self):
        """Add a new download task to the queue and start the worker thread if necessary."""
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._download_chapters)
            self._thread.daemon = True
            self._thread.start()

    def _download_chapters(self):
        """Download chapters and update progress in real-time."""
        chapter_db = None
        chapter_dict = None
        group_name = None

        while True:
            try:
                chapter_db = Chapter.objects.filter(
                    download_status=StatusChoices.LOADING
                ).first()

                if chapter_db is None:
                    return

                chapter_dict = model_to_dict(chapter_db)
                group_name = f"download_translate_{chapter_db.manhwa.encoded_name}"
                page_paths: list[str] = toonkor_api.download_chapter(chapter_db)

                if page_paths:
                    chapter_db.download_status = StatusChoices.READY
                    chapter_dict["download_status"] = StatusChoices.READY
                    chapter_db.save()

                    # Send progress update
                    self._send_progress(group_name, [chapter_dict])

                    if chapter_db.translation_status == StatusChoices.LOADING:
                        start_comic_proc()
                        self._send_translation_request()
                else:
                    raise Exception(
                        f"Failed to download chapter {chapter_db.index + 1} of {chapter_db.manhwa}"
                    )

            except Exception as e:
                print(e)

                if chapter_db is not None:
                    fields = ["download_status", "translation_status"]
                    for field in fields:
                        if getattr(chapter_db, field, None) == StatusChoices.LOADING:
                            setattr(chapter_db, field, StatusChoices.NOT_READY)
                            chapter_dict[field] = StatusChoices.NOT_READY.value
                    chapter_db.save()

                if chapter_dict and group_name:
                    self._send_progress(group_name, [chapter_dict])
                    self._send_error(group_name, str(e))

            finally:
                chapter_db = None
                chapter_dict = None
                group_name = None

    def _send_progress(self, group_name, chapters):
        """Send progress updates to the WebSocket group."""
        async_to_sync(self._channel_layer.group_send)(
            group_name,
            {
                "type": "send_progress",
                "chapters": chapters,
            },
        )

    def _send_error(self, group_name, error_message):
        """Send an error message to the WebSocket group."""
        async_to_sync(self._channel_layer.group_send)(
            group_name,
            {
                "type": "send_progress",
                "error": error_message,
            },
        )

    def _send_translation_request(self):
        """Send translation request to the 'qt' group."""
        async_to_sync(self._channel_layer.group_send)(
            "qt",
            {
                "type": "send_translation_request",
            },
        )


downloader = Downloader()
