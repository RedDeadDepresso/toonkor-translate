import traceback

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.forms.models import model_to_dict
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI

from django_backend.cleaner import cleaner
from django_backend.downloader import downloader
from django_backend.mangadex_api import mangadex_api
from django_backend.models import (
    Chapter,
    Manhwa,
    StatusChoices,
    ToonkorSettings,
)
from django_backend.schemas import (
    ChapterPaginationSchema,
    ChaptersSchema,
    ManhwaSchema,
    ResponseCurlCommandSchema,
    SetCurlCommandSchema,
)
from django_backend.toonkor_api import toonkor_api
from django_backend.utils import (
    add_manhwa_to_library,
    chapter_from_index,
    exract_mangadex_url,
    extract_toonkor_url,
    get_manhwa_details,
    is_valid_url,
    remove_manhwa_from_library,
    reset_start_time,
    start_comic_proc,
)


api = NinjaAPI()


@api.get("/library", response=list[ManhwaSchema])
def library(request):
    """Retrieve all Manhwa in the library."""
    return Manhwa.objects.filter(in_library=True)


@api.get("/browse", response=list[ManhwaSchema])
def browse(request, query: str):
    """Search for Manhwa using Mangadex API and update with Toonkor API."""
    try:
        if is_valid_url(query):
            toonkor_id = extract_toonkor_url(query)
            mangadex_id = exract_mangadex_url(query)
            if toonkor_id is not None:
                return [get_manhwa_details(toonkor_id)]
            elif mangadex_id is not None:
                results = mangadex_api.search_by_id(mangadex_id)
                return toonkor_api.multi_update_mangadex_search(results)

        results = mangadex_api.search(query)
        return toonkor_api.multi_update_mangadex_search(results)
    except Exception as e:
        traceback.print_exc()
        print(f"Error browsing Manhwa: {e}")
        return []


@api.get("/manhwa", response=ManhwaSchema)
def get_manhwa(request, toonkor_id: str):
    """Retrieve a specific Manhwa by toonkor_id from the library and external apis."""
    return get_manhwa_details(toonkor_id)


@api.post("/manhwa", response=bool)
def add_manhwa(request, toonkor_id: str):
    """Add a Manhwa to the library."""
    return add_manhwa_to_library(toonkor_id)[0]


@api.delete("/manhwa", response=bool)
def remove_manhwa(request, toonkor_id: str):
    """Remove a Manhwa from the library."""
    return remove_manhwa_from_library(toonkor_id)


@api.get("/curl_command", response=ResponseCurlCommandSchema)
def get_curl_command(request):
    toonkor_settings, _ = ToonkorSettings.objects.get_or_create(name="main")
    return {
        "curl_command": toonkor_settings.curl_command,
        "toonkor_url": toonkor_api.base_url,
    }


@api.post("/curl_command", response=ResponseCurlCommandSchema)
def set_curl_command(request, data: SetCurlCommandSchema):
    try:
        curl_command = data.curl_command
        if toonkor_api.set_curl_command(curl_command):
            reset_start_time()
            return {"curl_command": curl_command, "toonkor_url": toonkor_api.base_url}
        else:
            return {"error": "Invalid curl command"}
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


@api.post("/chapters", response=bool)
def download_chapters(request, data: ChaptersSchema):
    chapters = data.chapters
    translation = data.translation
    try:
        toonkor_ids = [chapter.toonkor_id for chapter in chapters]
        chapters_db = Chapter.objects.filter(toonkor_id__in=toonkor_ids)
        fields = {"download_status": StatusChoices.LOADING}
        if translation:
            fields["translation_status"] = StatusChoices.LOADING
        chapters_db.update(**fields)
        downloader.start()

        channel_layer = get_channel_layer()
        manhwa = chapters_db.first().manhwa
        group_name = f"download_translate_{manhwa.encoded_name}"
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "send_progress",
                "chapters": [
                    model_to_dict(chapter, exclude=["manhwa"])
                    for chapter in chapters_db
                ],
            },
        )
        return True
    except Exception:
        traceback.print_exc()
        return False


@api.delete("/chapters", response=bool)
def delete_chapters(request, data: ChaptersSchema):
    chapters = data.chapters
    translation = data.translation
    try:
        toonkor_ids = [chapter.toonkor_id for chapter in chapters]
        chapters_db = Chapter.objects.filter(toonkor_id__in=toonkor_ids)
        fields = {"download_status": StatusChoices.REMOVING}
        if translation:
            fields["translation_status"] = StatusChoices.REMOVING
        chapters_db.update(**fields)

        channel_layer = get_channel_layer()
        manhwa = chapters_db.first().manhwa
        group_name = f"download_translate_{manhwa.encoded_name}"
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "send_progress",
                "chapters": [
                    model_to_dict(chapter, exclude=["manhwa"])
                    for chapter in chapters_db
                ],
            },
        )
        cleaner.start()
        return True
    except Exception:
        traceback.print_exc()
        return False


@api.get("/chapter", response=ChapterPaginationSchema)
def chapter(request, toonkor_id: str, choice: str):
    chapter_db = get_object_or_404(Chapter, toonkor_id=toonkor_id)
    manhwa_dict = get_manhwa_details(chapter_db.manhwa.toonkor_id)

    prev_chapter = chapter_from_index(manhwa_dict, chapter_db.index - 1)
    current_chapter = chapter_from_index(manhwa_dict, chapter_db.index)
    next_chapter = chapter_from_index(manhwa_dict, chapter_db.index + 1)

    pages = []
    if choice == "downloaded":
        pages = chapter_db.media_download_pages
    elif choice == "translated":
        pages = chapter_db.media_translation_pages

    return {
        "manhwa_id": manhwa_dict["toonkor_id"],
        "manhwa_title": manhwa_dict["title"],
        "manhwa_en_title": manhwa_dict.get("en_title"),
        "prev_chapter": prev_chapter,
        "current_chapter": current_chapter,
        "next_chapter": next_chapter,
        "pages": pages,
    }


@api.get("/open_comic", response=bool)
def open_comic(request):
    start_comic_proc()
    return True
