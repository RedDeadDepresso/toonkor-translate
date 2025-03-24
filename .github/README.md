## Installation
- Clone the repo
- Follow these [instructions](https://github.com/ogkalu2/comic-translate)
- Install the additional requirements
```bash
uv add -r requirements-django.txt --compile-bytecode
```
```bash
uv run manage.py migrate
```
### Optional
- [Get a Gemini API key](https://ai.google.dev/gemini-api/docs/api-key)

## Usage
Navigate to Toonkor Translate folder and in your terminal run the command:
```bash
uv run manage.py runserver
```
- Open your browser and go to [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- Click the button on the top right with a terminal icon. This will launch Comic Translate.
- Paste your Gemini API key into Settings > Credentials in Comic Translate.
- Go to Settings > Tools and change Translator to Gemini-2.0-Flash.
- Go to Personalization > Language and change it to the language you want it translated to.
- Go to the Browse section on the website and search for any manhwa you are interested in. You can enter English terms or paste a Mangadex URL directly.
- Select the chapters you want translated and click the translate button on the top right. They will be added to the Comic Translate queue. Once finished, you can view the chapter in your browser.

### Note
The Comic Translate opened by the browser is different from the one in comic.py. 

It has some extra logic and the Django server will try to open it when translating chapters (See Changes Made for more informations).

It is therefore recommended to open Comic Translate when translating a manhwa only via the browser.

## Changes Made
- Implement a Django server
- Create a subclass of ComicTranslate called ComicTranslateDjango in comic_django.py that can communicate with the Django server via websocket and use a queue system for icoming translation requests.

## Acknowledgment
I'd like to express my gratitude to the following individuals, listed in no particular order:

- [ogkalu2](https://github.com/ogkalu2): for creating Comic Translate. It was the most suitable for manhwa from other programs I tried.
- [Mangadex](https://api.mangadex.org/docs/): for providing their API allowing the implementation of the search feature.
- [mantinedev](https://github.com/mantinedev): for the UI component library mantine and excellent documentation. 
