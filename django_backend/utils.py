import multiprocessing
import re

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.forms.models import model_to_dict
from django.utils import timezone

from django_backend.mangadex_api import mangadex_api
from django_backend.models import (
    Chapter,
    Manhwa,
    StatusChoices,
)
from django_backend.schemas import (
    ChapterSchema,
    ManhwaSchema,
)
from django_backend.toonkor_api import toonkor_api


comic_proc = None
_start_time = timezone.now()


def get_start_time():
    return _start_time


def reset_start_time():
    global _start_time
    _start_time = timezone.now()


def start_comic_proc():
    from comic_django import run_comic_translate

    global comic_proc
    if comic_proc is None or not comic_proc.is_alive():
        ready_event = multiprocessing.Event()
        comic_proc = multiprocessing.Process(
            target=run_comic_translate, args=(ready_event,)
        )
        comic_proc.daemon = True
        comic_proc.start()
        ready_event.wait()


def is_valid_url(url) -> bool:
    validator = URLValidator()
    try:
        validator(url)
        return True
    except ValidationError:
        return False


def exract_mangadex_url(url) -> str | None:
    pattern = r"^https?://(www\.)?mangadex\.org/title/([a-f0-9-]+)/?.*$"
    match = re.match(pattern, url)
    return match.group(2) if match else None


def extract_toonkor_url(url) -> str | None:
    pattern = r"^https?://tkor\d+\.com(/[\w%\-가-힣/]+).*$"
    match = re.match(pattern, url)
    return match.group(1) if match else None


def database_chapters(manhwa: Manhwa) -> dict[int, ChapterSchema]:
    chapters_dict = dict()
    try:
        chapters_db = Chapter.objects.filter(manhwa=manhwa)
        chapters_dict = {
            chapter_db.index: model_to_dict(chapter_db, exclude=["manhwa"])
            for chapter_db in chapters_db
        }
    except Exception as e:
        print(e)
    return chapters_dict


def database_chapters_to_list(
    chapters_db: dict[int, ChapterSchema],
) -> list[ChapterSchema]:
    chapters_list = list(chapters_db.values())
    return chapters_list


def update_manhwa_from_mangadex(
    manhwa_dict: ManhwaSchema, manhwa_db: Manhwa | None = None
):
    """Update Manhwa details using Mangadex API if necessary."""
    title = manhwa_dict["title"]
    mangadex_search = mangadex_api.search(title)

    if mangadex_search:
        mangadex_data = mangadex_search[0]
        manhwa_dict.update(mangadex_data)

    if mangadex_search and manhwa_db:
        # Update database fields
        for field in ["en_title", "en_description", "mangadex_id"]:
            if manhwa_dict.get(field):
                setattr(manhwa_db, field, manhwa_dict.get(field))


def get_manhwa_details(toonkor_id: str) -> ManhwaSchema:
    """Get Manhwa details from Toonkor API and update using Mangadex if needed."""
    manhwa_dict = {"chapters": {}}
    manhwa_db = Manhwa.objects.filter(toonkor_id=toonkor_id).first()

    if manhwa_db is not None:
        manhwa_dict = model_to_dict(manhwa_db)
        manhwa_dict["chapters"] = database_chapters(manhwa_db)

    if manhwa_db is not None and manhwa_db.last_update >= get_start_time():
        manhwa_dict["chapters"] = database_chapters_to_list(manhwa_dict["chapters"])
        return manhwa_dict

    try:
        toonkor_details, new_chapters = toonkor_api.get_manga_details(
            toonkor_id, manhwa_dict["chapters"]
        )
        manhwa_dict.update(toonkor_details)
        # Update from Mangadex if essential fields are missing
        if not all(
            [
                manhwa_dict.get("en_title"),
                manhwa_dict.get("en_description"),
                manhwa_dict.get("mangadex_id"),
            ]
        ):
            update_manhwa_from_mangadex(manhwa_dict, manhwa_db)
        manhwa_db.last_update = timezone.now()
        manhwa_db.save()

        if isinstance(manhwa_dict.get("chapters"), dict):
            manhwa_dict["chapters"] = database_chapters_to_list(manhwa_dict["chapters"])
        else:
            if manhwa_db:
                new_chapters = [
                    Chapter(**chapter_data, manhwa=manhwa_db)
                    for chapter_data in new_chapters
                ]
                Chapter.objects.bulk_create(new_chapters)

    except Exception as e:
        print(f"Error fetching details from Toonkor: {e}")

    if isinstance(manhwa_dict.get("chapters"), dict):
        manhwa_dict["chapters"] = database_chapters_to_list(manhwa_dict["chapters"])

    return manhwa_dict


def add_manhwa_to_library(toonkor_id: str) -> bool:
    """Add a Manhwa to the library from Toonkor and Mangadex details."""
    try:
        manhwa_dict = get_manhwa_details(toonkor_id)

        # Filter out keys not in the Manhwa model fields
        model_fields = {field.name for field in Manhwa._meta.get_fields()}
        filtered_data = {
            key: value for key, value in manhwa_dict.items() if key in model_fields
        }
        filtered_data["in_library"] = True
        manhwa, created = Manhwa.objects.get_or_create(
            toonkor_id=toonkor_id, defaults=filtered_data
        )

        if created:
            # Download and set the thumbnail
            img_url = manhwa_dict.get("thumbnail", "")
            thumbnail_path = toonkor_api.download_thumbnail(manhwa, img_url)
            if thumbnail_path:
                manhwa.thumbnail = thumbnail_path
            manhwa.save()

            # Save Chapters
            chapters = [
                Chapter(**chapter_data, manhwa=manhwa)
                for chapter_data in manhwa_dict["chapters"]
            ]
            Chapter.objects.bulk_create(chapters)

        return True, manhwa
    except Exception as e:
        print(f"Error adding Manhwa to library: {e}")
        return False, None


def remove_manhwa_from_library(toonkor_id: str) -> bool:
    """Remove a Manhwa from the library and update the cache."""
    try:
        manhwa = Manhwa.objects.filter(toonkor_id=toonkor_id).first()

        if manhwa is not None:
            if manhwa.chapter_set.exclude(
                download_status=StatusChoices.NOT_READY,
                translation_status=StatusChoices.NOT_READY,
            ).exists():
                manhwa.in_library = False
                manhwa.save()
            else:
                manhwa.delete()

        return True
    except Exception as e:
        print(f"Error removing Manhwa from library: {e}")
        return False


def chapter_from_index(manhwa_dict, index: int) -> ChapterSchema | None:
    try:
        if index < 0:
            return None
        return manhwa_dict["chapters"][index]
    except Exception as e:
        print(e)
        return None
