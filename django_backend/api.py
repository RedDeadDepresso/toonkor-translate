import re
import os
import multiprocessing

from ninja import NinjaAPI
from django.forms.models import model_to_dict
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django_backend.models import Manhwa, Chapter, ToonkorSettings
from django_backend.schemas import ChapterPaginationSchema, ChapterSchema, ManhwaSchema, SetToonkorUrlSchema, ResponseToonkorUrlSchema
from django_backend.mangadex_api import mangadex_api
from django_backend.toonkor_api import toonkor_api


api = NinjaAPI()
default_value = ManhwaSchema
cached_manhwas = dict()
comic_proc = None


def start_comic_proc():
    from comic_django import run_comic_translate
    global comic_proc
    if comic_proc is None or not comic_proc.is_alive():
        ready_event = multiprocessing.Event()
        comic_proc = multiprocessing.Process(target=run_comic_translate, args=(ready_event,))
        comic_proc.daemon = True
        comic_proc.start()
        ready_event.wait()


def is_valid_url(url):
    validator = URLValidator()
    try:
        validator(url)
        return True
    except ValidationError:
        return False


def exract_mangadex_url(url):
    pattern = r'^https?://(www\.)?mangadex\.org/title/([a-f0-9-]+)/?.*$'
    match = re.match(pattern, url)
    return match.group(2) if match else None


def extract_toonkor_url(url):
    pattern = r'^https?://tkor\d+\.com(/[\w%\-가-힣/]+).*$'
    match = re.match(pattern, url)
    return match.group(1) if match else None


def search_database(toonkor_id: str) -> Manhwa | None:
    """Search for a Manhwa in the database by toonkor_id."""
    try:
        manhwa = Manhwa.objects.get(toonkor_id=toonkor_id)
        return manhwa
    except Exception as e:
        return None


def database_chapters(manhwa_id: str) -> list:
    chapters_db_dict = dict()
    try:
        chapters_db = Chapter.objects.filter(manhwa_id=manhwa_id)
        chapters_db_dict = {chapter_db.index: model_to_dict(chapter_db, exclude=['manhwa_id']) for chapter_db in chapters_db}
    except Exception as e:
        print(e)
    return chapters_db_dict


def database_chapters_to_list(chapters_db: dict):
    chapters_list = list(chapters_db.values())
    chapters_list.sort(key=lambda x: x["index"])
    return chapters_list


def update_cached_chapter(toonkor_id: str, chapter_index: int, key: str, value) -> bool:
    try:
        if not cached_manhwas.get(toonkor_id):
            get_manhwa_details(toonkor_id)
        
        cached_chapters = cached_manhwas[toonkor_id]['chapters']

        if isinstance(cached_chapters, dict):
            if chapter_index in cached_chapters:
                cached_chapters[chapter_index][key] = value
                    
        elif isinstance(cached_chapters, list):
            cached_chapters[chapter_index][key] = value

        return True
    except Exception as e:
        print(e)
        return False
                            

def update_manhwa_from_mangadex(manhwa: dict, manhwa_db: Manhwa | None):
    """Update Manhwa details using Mangadex API if necessary."""
    mangadex_search = mangadex_api.search(manhwa["title"])
    if mangadex_search:
        mangadex_data = mangadex_search[0]
        manhwa.update(mangadex_data)
        
        if manhwa_db:
            # Update database fields
            manhwa_db.en_title = manhwa.get("en_title", "")
            manhwa_db.en_description = manhwa.get("en_description", "")
            manhwa_db.mangadex_id = manhwa.get("mangadex_id", "")
            manhwa_db.save()

    else:
        manhwa['en_title'] = ''
        manhwa['en_description'] = ''

def get_manhwa_details(toonkor_id: str) -> dict:
    """Get Manhwa details from Toonkor API and update using Mangadex if needed."""
    if toonkor_id in cached_manhwas:
        return cached_manhwas[toonkor_id]
    
    manhwa = {}
    manhwa_db = search_database(toonkor_id)

    if manhwa_db is not None:
        manhwa = model_to_dict(manhwa_db)
        manhwa["in_library"] = True

    manhwa["chapters"] = database_chapters(toonkor_id)

    try:
        toonkor_details = toonkor_api.get_manga_details(toonkor_id, manhwa['chapters'])
        manhwa.update(toonkor_details)
        # Update from Mangadex if essential fields are missing
        if not all([manhwa.get("en_title"), manhwa.get("en_description"), manhwa.get("mangadex_id")]):
            update_manhwa_from_mangadex(manhwa, manhwa_db)
    except Exception as e:
        print(f"Error fetching details from Toonkor: {e}")

    if isinstance(manhwa.get("chapters"), dict):
        manhwa['chapters'] = database_chapters_to_list(manhwa['chapters'])

    cached_manhwas[toonkor_id] = manhwa
    return manhwa


def add_manhwa_to_library(toonkor_id: str) -> bool:
    """Add a Manhwa to the library from Toonkor and Mangadex details."""
    try:
        manhwa_dict = get_manhwa_details(toonkor_id)

        # Filter out keys not in the Manhwa model fields
        model_fields = {field.name for field in Manhwa._meta.get_fields()}
        filtered_data = {key: value for key, value in manhwa_dict.items() if key in model_fields}
        manhwa, _ = Manhwa.objects.get_or_create(**filtered_data)

        # Download and set the thumbnail
        img_url = manhwa_dict.get('thumbnail', '')
        thumbnail_path = toonkor_api.download_thumbnail(manhwa, img_url)
        if thumbnail_path:
            manhwa.thumbnail = thumbnail_path
        manhwa.save()

        # Update cache
        manhwa_dict["in_library"] = True
        cached_manhwas[toonkor_id] = manhwa_dict
        return True
    except Exception as e:
        print(f"Error adding Manhwa to library: {e}")
        return False


def remove_manhwa_from_library(toonkor_id: str) -> bool:
    """Remove a Manhwa from the library and update the cache."""
    try:
        Manhwa.objects.filter(toonkor_id=toonkor_id).delete()
        if toonkor_id in cached_manhwas:
            cached_manhwas[toonkor_id]["in_library"] = False
        return True
    except Exception as e:
        print(f"Error removing Manhwa from library: {e}")
        return False


@api.get("/library", response=list[ManhwaSchema])
def library(request):
    """Retrieve all Manhwa in the library."""
    return Manhwa.objects.all()


@api.get("/manhwa", response=ManhwaSchema)
def manhwa(request, toonkor_id: str):
    """Retrieve a specific Manhwa by toonkor_id from the library."""
    return get_manhwa_details(toonkor_id)


@api.get("/browse/search")
def browse(request, query: str):
    """Search for Manhwa using Mangadex API and update with Toonkor API."""
    try:
        if is_valid_url(query):
            toonkor_slug = extract_toonkor_url(query)
            mangadex_id = exract_mangadex_url(query)
            if toonkor_slug is not None:
                return [get_manhwa_details(toonkor_slug)]
            elif mangadex_id is not None:
                results = mangadex_api.search_by_id(mangadex_id)
                return toonkor_api.multi_update_mangadex_search(results)

        results = mangadex_api.search(query)
        return toonkor_api.multi_update_mangadex_search(results)
    except Exception as e:
        print(f"Error browsing Manhwa: {e}")
        return []


@api.get("/add_library", response=bool)
def add_library(request, toonkor_id: str):
    """Add a Manhwa to the library."""
    return add_manhwa_to_library(toonkor_id)


@api.get("/remove_library", response=bool)
def remove_library(request, toonkor_id: str):
    """Remove a Manhwa from the library."""
    return remove_manhwa_from_library(toonkor_id)


@api.get("/get_toonkor_url", response=ResponseToonkorUrlSchema)
def get_toonkor_url(request):
    toonkor_settings, created = ToonkorSettings.objects.get_or_create(name="general")
    return {'url': toonkor_settings.url, 'error': ''}


@api.get("/fetch_toonkor_url", response=ResponseToonkorUrlSchema)
def fetch_toonkor_url(request):
    try:
        url = toonkor_api.fetch_toonkor_url()
        if toonkor_api.base_url == url:
            return {'url': url, 'error': ''}
        elif toonkor_api.set_toonkor_url(url):
            cached_manhwas.clear()
            return {'url': url, 'error': ''}
        else:
            return {'url': '', 'error': 'Invalid Url'}
    except Exception as e:
        return {'url': '', 'error': str(e)}


@api.post("/set_toonkor_url", response=ResponseToonkorUrlSchema)
def set_toonkor_url(request, data: SetToonkorUrlSchema):
    try:
        if toonkor_api == data.url:
            return {'url': data.url, 'error': ''}     
        elif toonkor_api.set_toonkor_url(data.url):
            cached_manhwas.clear()
            return {'url': data.url, 'error': ''}
        else:
            return {'url': '', 'error': 'Invalid Url'}
    except Exception as e:
        return {'url': '', 'error': str(e)}


def chapter_from_index(manhwa, index: int) -> ChapterSchema | None:
    try:
        if index < 0:
            return None
        return manhwa['chapters'][index]
    except:
        return None
    

@api.get("/chapter", response=ChapterPaginationSchema)
def chapter(request, toonkor_id: str, choice: str):
    chapter_db = get_object_or_404(Chapter, toonkor_id=toonkor_id)
    manhwa_dict = get_manhwa_details(chapter_db.manhwa_id)

    prev_chapter = chapter_from_index(manhwa_dict, chapter_db.index - 1)
    current_chapter = chapter_from_index(manhwa_dict, chapter_db.index)
    next_chapter = chapter_from_index(manhwa_dict, chapter_db.index + 1)

    pages = []
    if choice == 'downloaded':
        pages = chapter_db.media_download_pages
    elif choice == 'translated':
        pages = chapter_db.media_translation_pages

    return {
        'manhwa_id': manhwa_dict['toonkor_id'],
        'manhwa_title': manhwa_dict['title'],
        'manhwa_en_title': manhwa_dict.get('en_title'),
        'prev_chapter': prev_chapter,
        'current_chapter': current_chapter,
        'next_chapter': next_chapter,

        'pages': pages
    }


@api.get('/open_comic', response=bool)
def open_comic(request):
    start_comic_proc()
    return True