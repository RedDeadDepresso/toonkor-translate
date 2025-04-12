import threading

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Q
from django.forms import model_to_dict

from django_backend.models import Chapter, StatusChoices


class Cleaner:
    def __init__(self):
        self._thread = None
        self._channel_layer = get_channel_layer()

    def start(self):
        """start the worker thread if necessary."""
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._remove_chapters)
            self._thread.daemon = True
            self._thread.start()

    def _remove_chapters(self):
        chapter_db = None
        chapter_dict = None
        group_name = None

        while True:
            try:
                chapter_db = (
                    Chapter.objects.filter(
                        Q(download_status=StatusChoices.REMOVING)
                        | Q(translation_status=StatusChoices.REMOVING)
                    )
                    .order_by("last_edit", "index")
                    .first()
                )

                if chapter_db is None:
                    return

                chapter_dict = model_to_dict(chapter_db)
                group_name = f"download_translate_{chapter_db.manhwa.encoded_name}"

                if chapter_db.download_status == StatusChoices.REMOVING:
                    chapter_db.delete_download()
                    chapter_dict["download_status"] = StatusChoices.NOT_READY.value
                    self._send_progress(group_name, [chapter_dict])

                if chapter_db.translation_status == StatusChoices.REMOVING:
                    chapter_db.delete_translation()
                    chapter_dict["translation_status"] = StatusChoices.NOT_READY.value
                    self._send_progress(group_name, [chapter_dict])

            except Exception as e:
                print(e)

                if chapter_db is not None:
                    fields = ["download_status", "translation_status"]
                    for field in fields:
                        if getattr(chapter_db, field, None) == StatusChoices.REMOVING:
                            setattr(chapter_db, field, StatusChoices.READY)
                            chapter_dict[field] = StatusChoices.READY.value
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


cleaner = Cleaner()
