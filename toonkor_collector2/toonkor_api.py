import base64
import re
from datetime import datetime
from typing import List, Optional
from bs4 import BeautifulSoup
import requests
import re
import os
import concurrent.futures
from django.utils.timesince import timesince
from toonkor_collector2.models import ToonkorSettings, encode_name
from toonkor_collector2.schemas import ManhwaSchema


class ToonkorAPI:
    def __init__(self):
        self.telegram_url = "https://t.me/s/new_toonkor"
        self.client = requests.Session()
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
        }
        toonkor_settings, created = ToonkorSettings.objects.get_or_create(name="general")
        self.base_url = toonkor_settings.url

    # Settings
    def fetch_toonkor_url(self):
        response = self.client.get(self.telegram_url, headers=self.headers)
        soup = BeautifulSoup(response.text, "lxml")
        a_tags = soup.select("div.tgme_widget_message_text.js-message_text > a")
        for a_tag in reversed(a_tags):
            if "toonkor" in a_tag.text:
                return a_tag.text
            
    def set_toonkor_url(self, url: str):
        response = self.client.get(url, headers=self.headers)
        if response.status_code == 200:
            toonkor_api.base_url = url
            toonkor_settings, created = ToonkorSettings.objects.get_or_create(name="general")
            toonkor_settings.url = url
            toonkor_settings.save()
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

        return {"title": title_element.text, "toonkor_id": toonkor_id, "thumbnail": thumbnail_url}

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

        response = self.client.get(search_url, headers=self.headers)
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
        response = self.client.get(search_url, headers=self.headers)
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
        chapter_slug = toonkor_id.replace('-', '_')
        chapter_elm_list = document.select(self.chapter_list_selector())

        for index, chapter_elm in enumerate(reversed(chapter_elm_list)):
            chapter_dict = self.chapter_from_element(chapter_elm)
            if index in chapters_db:
                chapter_dict.update(chapters_db[index])
            if not chapter_dict['toonkor_id']:
                chapter_dict['toonkor_id'] = f'{chapter_slug}_{index}화.html`'

            chapter_dict["index"] = index
            chapters.append(chapter_dict)

        return {
            "title": title,
            "author": author,
            "description": description,
            "thumbnail": f"{self.base_url}/{thumbnail_url}",
            "chapters": chapters,
        }

    def get_manga_details(self, toonkor_id: str, chapters_db=dict()) -> ManhwaSchema:
        manga_url = f"{self.base_url}{toonkor_id}"
        response = self.client.get(manga_url, headers=self.headers)
        soup = BeautifulSoup(response.text, "lxml")
        details = self.manga_details_parse(soup, toonkor_id, chapters_db)
        details["toonkor_id"] = toonkor_id
        return details

    # Chapters
    def chapter_list_selector(self) -> str:
        return "table.web_list tr:has(td.content__title)"

    def chapter_from_element(self, element) -> dict:
        content_title = element.select_one("td.content__title")
        date_upload = self.to_date(element.select_one("td.episode__index").text)
        toonkor_id = content_title.get('data-role', '')
        return {
            "date_upload": date_upload,
            "status": "On Toonkor",
            "toonkor_id": toonkor_id
        }

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
        response = self.client.get(chapter_url, headers=self.headers)
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
        except:
            return None

    def download_page(
        self, manhwa_path: str, chapter_index: str, page_index: str, page_url: str
    ) -> str:
        with requests.get(page_url, stream=True) as response:
            _, extension = os.path.splitext(page_url)
            img_path = os.path.abspath(f"{manhwa_path}/{chapter_index}/{page_index}{extension}")
            if not os.path.exists(img_path):
                with open(img_path, "wb") as out_file:
                    out_file.write(response.content)
            return img_path

    def download_chapter(self, manhwa_id: str, chapter_dict: dict) -> list[str]:
        try:
            # Create necessary directories
            manhwa_path = f"toonkor_collector2/media/{encode_name(manhwa_id)}"
            os.makedirs(f"{manhwa_path}/{chapter_dict['index']}", exist_ok=True)

            # Get chapter details
            page_list = self.get_page_list(chapter_dict['toonkor_id'])

            # Download all pages concurrently
            with concurrent.futures.ThreadPoolExecutor() as executor:
                futures = [
                    executor.submit(
                        self.download_page, manhwa_path, chapter_dict["index"], page["index"], page["url"]
                    )
                    for page in page_list
                ]
                page_paths = {
                    future.result()
                    for future in concurrent.futures.as_completed(futures)
                }

            return list(page_paths)

        except Exception as e:
            print(f"Error downloading chapter {chapter_dict['index'] + 1} of {manhwa_id}: {str(e)}")
            return None


toonkor_api = ToonkorAPI()
