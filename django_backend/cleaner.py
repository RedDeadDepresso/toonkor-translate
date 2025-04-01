import asyncio
import threading
from collections import deque

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer

from django_backend.models import Chapter, StatusChoices


class Cleaner:
    def __init__(self):
        self._queue = deque()
        self._thread = None
        self._channel_layer = get_channel_layer()

    def append(self, manhwa_id, group_name, chapters, remove_choices):
        """Add a new download task to the queue and start the worker thread if necessary."""
        self._queue.append([manhwa_id, group_name, chapters, remove_choices])

        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._run_loop)
            self._thread.daemon = True
            self._thread.start()

    def _run_loop(self):
        """Worker loop that processes tasks from the queue."""
        while self._queue:
            manhwa_id, group_name, chapters, remove_choices = self._queue.popleft()
            try:
                for chapter in chapters:
                    asyncio.run(
                        self._remove(manhwa_id, group_name, chapter, remove_choices)
                    )
            except Exception:
                import traceback

                traceback.print_exc()

    async def _remove(self, manhwa_id, group_name, chapter, remove_choices):
        chapter_obj = await sync_to_async(Chapter.objects.get)(
            manhwa_id=manhwa_id,
            index=chapter["index"],
            toonkor_id=chapter["toonkor_id"],
            date_upload=chapter["date_upload"],
        )
        if remove_choices["downloaded"]:
            chapter_obj.delete_download(save=False)
            chapter["download_status"] = StatusChoices.NOT_READY.value

        if remove_choices["translated"]:
            chapter_obj.delete_translation(save=False)
            chapter["translation_status"] = StatusChoices.NOT_READY.value

        await sync_to_async(chapter_obj.save)()
        await self._send_progress(group_name, [chapter], {})

    async def _send_progress(self, group_name, chapters, progress):
        """Send progress updates to the WebSocket group."""
        await self._channel_layer.group_send(
            group_name,
            {
                "type": "send_progress",
                "chapters": chapters,
                "progress": progress,
            },
        )


cleaner = Cleaner()
