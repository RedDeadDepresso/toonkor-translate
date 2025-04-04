from typing import Literal

from ninja import Schema


class ChapterSchema(Schema):
    index: str | int
    date_upload: str = ""
    toonkor_id: str = ""

    download_status: Literal["NOT_READY", "LOADING", "READY", "REMOVING"] = "NOT_READY"
    translation_status: Literal["NOT_READY", "LOADING", "READY", "REMOVING"] = (
        "NOT_READY"
    )


class ManhwaSchema(Schema):
    title: str
    description: str = ""
    chapters: list[ChapterSchema] = []

    en_title: str = ""
    en_description: str = ""

    thumbnail: str = ""
    in_library: bool = False

    mangadex_id: str = ""
    toonkor_id: str


class ChapterPaginationSchema(Schema):
    manhwa_id: str
    manhwa_title: str
    manhwa_en_title: str
    prev_chapter: ChapterSchema | None = None
    current_chapter: ChapterSchema
    next_chapter: ChapterSchema | None = None
    pages: list[str]


class SetSettingsSchema(Schema):
    curl_command: str
    translation_page_limit: int


class ResponseSettingsSchema(Schema):
    curl_command: str = ""
    toonkor_url: str = ""
    translation_page_limit: int = 999
    error: str = ""


class ChaptersSchema(Schema):
    chapters: list[ChapterSchema]
    translation: bool = False


class DownloadTranslateSchema(Schema):
    task: Literal["download", "download_translate", "remove"]
    toonkor_id: str
    chapters: list[int]
    remove_choices: Literal["downloaded", "translated"] = ""


class ProgressSchema(Schema):
    chapters: list[ChapterSchema] = []
    error: str = ""
