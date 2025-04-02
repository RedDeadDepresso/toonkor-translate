import base64
import concurrent.futures
import os
import re
from datetime import datetime
from typing import List
from urllib.parse import urlparse

import requests
import uncurl
from bs4 import BeautifulSoup
from django.utils.timesince import timesince

from django_backend.models import Chapter, ToonkorSettings
from django_backend.schemas import ManhwaSchema


class ToonkorAPI:
    def __init__(self):
        toonkor_settings, _ = ToonkorSettings.objects.get_or_create(name="main")
        context = uncurl.parse_context(toonkor_settings.curl_command)

        self.client = requests.Session()
        self.base_url = self.get_base_url(context.url)
        context.headers.pop("Accept-Encoding", None)
        self.headers = context.headers
        self.cookies = context.cookies

    def get_base_url(self, url):
        parsed_url = urlparse(url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        return base_url

    def set_curl_command(self, curl_command: str):
        context = uncurl.parse_context(curl_command)
        base_url = self.get_base_url(context.url)
        context.headers.pop("Accept-Encoding", None)
        response = self.client.get(
            base_url, headers=context.headers, cookies=context.cookies
        )
        if response.status_code == 200:
            ToonkorSettings.objects.update_or_create(
                name="main", defaults={"curl_command": curl_command}
            )
            self.base_url = base_url
            self.headers = context.headers
            self.cookies = context.cookies
            return True
        return False

    # Popular
    webtoons_request_path = "/%EC%9B%B9%ED%88%B0"

    def popular_manga_request(self, page: int) -> str:
        return self.base_url + self.webtoons_request_path

    def popular_manga_selector(self) -> str:
        return "div.section-item-inner"

    def popular_manga_from_element(self, element) -> dict:
        title_element = element.select_one("div.section-item-title a h3")
        toonkor_id = element.select_one("div.section-item-title a")["href"]
        thumbnail_url = element.select_one("img")["src"]

        return {
            "title": title_element.text,
            "toonkor_id": toonkor_id,
            "thumbnail": thumbnail_url,
        }

    latest_request_modifier = "?fil=%EC%B5%9C%EC%8B%A0"

    def latest_updates_request(self, page: int) -> str:
        return self.base_url + self.webtoons_request_path + self.latest_request_modifier

    def latest_updates_selector(self) -> str:
        return self.popular_manga_selector()

    def latest_updates_from_element(self, element) -> dict:
        return self.popular_manga_from_element(element)

    # Search
    def search_manga_request(self, page: int, query: str, filters: dict) -> str:
        filter_list = filters or self.get_filter_list()

        # Webtoons, Manga, or Hentai
        type_filter = filter_list.get("type", "")
        # Popular, Latest, or Completed
        sort_filter = filter_list.get("sort", "")

        if query:
            request_path = f"/bbs/search.php?sfl=wr_subject%7C%7Cwr_content&stx={query}"
        elif type_filter == "Hentai" and sort_filter == "Completed":
            request_path = type_filter
        else:
            request_path = type_filter + sort_filter

        return self.base_url + request_path

    def search_manga_selector(self) -> str:
        return self.popular_manga_selector()

    def search_manga_from_element(self, element) -> dict:
        return self.popular_manga_from_element(element)

    def search(self, query: str):
        filters = {
            "type": "/%EB%8B%A8%ED%96%89%EB%B3%B8",  # Optional: specify type (e.g., "Manga")
            "sort": "?fil=%EC%B5%9C%EC%8B%A0",  # Optional: specify sorting (e.g., "Latest")
        }
        search_url = self.search_manga_request(1, query, filters)

        response = self.client.get(
            search_url, headers=self.headers, cookies=self.cookies
        )
        soup = BeautifulSoup(response.text, "lxml")

        # Parse the search results
        output = []
        for element in soup.select(self.search_manga_selector()):
            manga = self.search_manga_from_element(element)
            output.append(manga)

        return output

    def update_mangadex_search(self, mangadex_search: ManhwaSchema) -> ManhwaSchema:
        filters = {
            "type": "/%EB%8B%A8%ED%96%89%EB%B3%B8",  # Optional: specify type (e.g., "Manga")
            "sort": "?fil=%EC%B5%9C%EC%8B%A0",  # Optional: specify sorting (e.g., "Latest")
        }
        search_url = self.search_manga_request(1, mangadex_search["title"], filters)
        response = self.client.get(
            search_url, headers=self.headers, cookies=self.cookies
        )
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.text, "lxml")
        for element in soup.select(self.search_manga_selector()):
            manga = self.search_manga_from_element(element)
            if not manga:
                return None
            else:
                mangadex_search.update(manga)
                return mangadex_search

    def multi_update_mangadex_search(
        self, mangadex_results: list[ManhwaSchema]
    ) -> list[ManhwaSchema]:
        output = []
        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [
                executor.submit(self.update_mangadex_search, mangadex_search)
                for mangadex_search in mangadex_results
            ]
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result is not None:
                    output.append(result)
        return output

    # Details
    def manga_details_parse(self, document, toonkor_id, chapters_db=dict()) -> dict:
        title = document.select_one("td.bt_title").text
        author = document.select_one("td.bt_label span.bt_data").text
        description = document.select_one("td.bt_over").text
        thumbnail_url = document.select_one("td.bt_thumb img")["src"]

        chapters = []
        new_chapters = []
        chapter_slug = toonkor_id.replace("-", "_")
        chapter_elm_list = document.select(self.chapter_list_selector())

        for index, chapter_elm in enumerate(reversed(chapter_elm_list)):
            chapter_dict = self.chapter_from_element(chapter_elm)

            if index in chapters_db:
                chapter_dict.update(chapters_db[index])
            else:
                new_chapters.append(chapter_dict)

            if not chapter_dict["toonkor_id"]:
                chapter_dict["toonkor_id"] = f"{chapter_slug}_{index}화.html`"

            chapter_dict["index"] = index
            chapters.append(chapter_dict)

        return {
            "title": title,
            "author": author,
            "description": description,
            "thumbnail": f"{self.base_url}/{thumbnail_url}",
            "chapters": chapters,
            "toonkor_id": toonkor_id,
        }, new_chapters

    def get_manga_details(self, toonkor_id: str, chapters_db=dict()) -> ManhwaSchema:
        manga_url = f"{self.base_url}{toonkor_id}"
        response = self.client.get(
            manga_url, headers=self.headers, cookies=self.cookies
        )
        soup = BeautifulSoup(response.text, "lxml")
        return self.manga_details_parse(soup, toonkor_id, chapters_db)

    # Chapters
    def chapter_list_selector(self) -> str:
        return "table.web_list tr:has(td.content__title)"

    def chapter_from_element(self, element) -> dict:
        content_title = element.select_one("td.content__title")
        date_upload = self.to_date(element.select_one("td.episode__index").text)
        toonkor_id = content_title.get("data-role", "")
        return {"date_upload": date_upload, "toonkor_id": toonkor_id}

    @staticmethod
    def to_date(date_str: str) -> int:
        date_format = "%Y-%m-%d"
        return timesince(datetime.strptime(date_str, date_format))

    # Pages
    page_list_regex = re.compile(r'src="([^"]*)"')

    def page_list_parse(self, document) -> List[dict]:
        document = str(document)
        encoded = re.search(r"toon_img\s*=\s*'(.*?)'", document).group(1)
        if not encoded:
            raise Exception("toon_img script not found")

        decoded = base64.b64decode(encoded).decode("utf-8")
        return [
            {"index": i, "url": url if url.startswith("http") else self.base_url + url}
            for i, url in enumerate(self.page_list_regex.findall(decoded))
        ]

    def get_page_list(self, chapter_id: str):
        chapter_url = f"{self.base_url}{chapter_id}"
        response = self.client.get(
            chapter_url, headers=self.headers, cookies=self.cookies
        )
        soup = BeautifulSoup(response.text, "lxml")
        return self.page_list_parse(soup)

    # Filters
    def get_filter_list(self) -> dict:
        return {"type": self.get_type_list(), "sort": self.get_sort_list()}

    def get_type_list(self) -> dict:
        return {
            "Webtoons": self.webtoons_request_path,
            "Manga": "/%EB%8B%A8%ED%96%89%EB%B3%B8",
            "Hentai": "/%EB%A7%9D%EA%B0%80",
        }

    def get_sort_list(self) -> dict:
        return {
            "Popular": "",
            "Latest": self.latest_request_modifier,
            "Completed": "/%EC%99%84%EA%B2%B0",
        }

    # Download
    def download_thumbnail(self, manhwa, img_url: str) -> str | None:
        try:
            os.makedirs(manhwa.path, exist_ok=True)
            _, extension = os.path.splitext(img_url)
            img_path = f"{manhwa.path}/thumbnail{extension}"
            response = requests.get(img_url, stream=True)
            with open(img_path, "wb") as out_file:
                out_file.write(response.content)
            return os.path.basename(manhwa.path) + f"/thumbnail{extension}"
        except Exception as e:
            print(e)
            return None

    def download_page(
        self, manhwa_path: str, chapter_index: int, page_index: str, page_url: str
    ) -> str:
        try:
            with self.client.get(
                page_url, headers=self.headers, cookies=self.cookies, stream=True
            ) as response:
                _, extension = os.path.splitext(page_url)
                img_path = os.path.abspath(
                    f"{manhwa_path}/{chapter_index}/{page_index}{extension}"
                )
                if not os.path.exists(img_path):
                    with open(img_path, "wb") as out_file:
                        out_file.write(response.content)
                return img_path
        except Exception as e:
            print(e)

    def download_chapter(self, chapter: Chapter) -> list[str]:
        try:
            # Create necessary directories
            manhwa_path = chapter.manhwa.path
            os.makedirs(f"{manhwa_path}/{chapter.index}", exist_ok=True)

            # Get chapter details
            page_list = self.get_page_list(chapter.toonkor_id)

            # Download all pages concurrently
            with concurrent.futures.ThreadPoolExecutor() as executor:
                futures = [
                    executor.submit(
                        self.download_page,
                        manhwa_path,
                        chapter.index,
                        page["index"],
                        page["url"],
                    )
                    for page in page_list
                ]
                page_paths = {
                    future.result()
                    for future in concurrent.futures.as_completed(futures)
                }

            return list(page_paths)

        except Exception as e:
            print(
                f"Error downloading chapter {chapter.index + 1} of {chapter.manhwa}: {str(e)}"
            )
            return None


toonkor_api = ToonkorAPI()
