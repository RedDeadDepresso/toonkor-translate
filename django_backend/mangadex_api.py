import concurrent.futures

import requests

from django_backend.schemas import ManhwaSchema


class MangadexAPI:
    def __init__(self):
        self.client = requests.Session()
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
        }
        self.base_url = "https://api.mangadex.org"

    def extract_response(self, response):
        output = []

        # Get the data from the response
        data = response.json().get("data", [])

        # Check if data is a list or a single object, and convert single objects to a list
        if isinstance(data, dict):
            data = [data]

        # Iterate through each result in the data list
        for result in data:
            # Extract altTitles from attributes and find the Korean title
            for alt_title in result["attributes"].get("altTitles", []):
                if "ko" in alt_title:
                    korean_title = alt_title["ko"]

                    # Create the temp dictionary with the needed fields
                    temp = {
                        "title": korean_title,
                        "en_title": result["attributes"]["title"].get("en", ""),
                        "en_description": result["attributes"]["description"].get(
                            "en", ""
                        ),
                        "mangadex_id": result["id"],
                    }

                    output.append(temp)
                    break  # Exit after finding the first Korean title

        return output

    def search(self, query: str) -> list[ManhwaSchema]:
        response = self.client.get(
            f"{self.base_url}/manga", params={"title": query}, headers=self.headers
        )
        return self.extract_response(response)

    def search_by_id(self, id: str) -> list[ManhwaSchema]:
        response = self.client.get(f"{self.base_url}/manga/{id}", headers=self.headers)
        return self.extract_response(response)

    def update_toonkor_search(self, toonkor_search: dict) -> ManhwaSchema:
        korean_title = toonkor_search["title"]

        response = self.client.get(
            f"{self.base_url}/manga",
            params={"title": korean_title},
            headers=self.headers,
        )
        results = self.extract_response(response)
        if results:
            toonkor_search.update(results[0])

        return toonkor_search

    def multi_update_toonkor_search(
        self, toonkor_results: list[ManhwaSchema]
    ) -> list[ManhwaSchema]:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [
                executor.submit(self.update_toonkor_search, toonkor_search)
                for toonkor_search in toonkor_results
            ]
            return [
                future.result() for future in concurrent.futures.as_completed(futures)
            ]


mangadex_api = MangadexAPI()
