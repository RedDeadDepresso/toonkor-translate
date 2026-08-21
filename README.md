# Toonkor Translate

<img width="2560" height="1528" alt="Screenshot 2026-08-21 144604" src="https://github.com/user-attachments/assets/6bae27b5-0ac1-4e51-a097-ee08ba38e7b8" />

A desktop application for downloading and translating Korean manhwa from Toonkor into English. Built with Wails, Go, and React.

Translation is handled by [Koharu](https://github.com/mayocream/koharu), a local application that runs OCR, inpainting, and LLM-based translation on manga and manhwa pages.


## Features

- Browse and search manhwa on Toonkor
- Download chapters for offline reading
- Translate chapters to English using Koharu
- Support for local LLM models and API providers (OpenAI, Gemini, Claude, DeepSeek, DeepL, Google Translate)
- Rate-limited translation batching to stay within API limits
- Automatic OCR engine selection optimized for Korean text (PaddleOCR-VL)


## Requirements

- [Koharu](https://github.com/mayocream/koharu) installed on your machine
- An LLM configured in Koharu (local model or API provider with key set in Koharu's settings)
- A valid curl command from Toonkor (used to bypass Cloudflare protection)


## Installation

Download the latest release for your platform from the releases page and run the installer.

To build from source, see the Development section below.


## Setup

### 1. Curl command

Toonkor uses Cloudflare protection. To bypass it, you need to export a curl command from your browser after visiting the site.

1. Open Toonkor in your browser and complete any Cloudflare challenge
2. Open DevTools (F12) and go to the Network tab
3. Find any request to toonkor116.com, right-click it, and select "Copy as cURL"
4. Paste the curl command into Settings

### 2. Koharu path

Point the application to your Koharu executable. Click Browse in Settings to select it, or enter the path manually.

The default expected location is:

- Windows: `%LOCALAPPDATA%\koharu\koharu.exe`
- macOS / Linux: `~/.cache/koharu/koharu`

### 3. LLM configuration

API keys for providers are managed inside Koharu, not in this application. To configure a provider:

1. Open Koharu (use the button in the top navigation bar)
2. Go to Settings inside Koharu
3. Navigate to Providers and enter your API key for the provider you want to use

Once the key is set in Koharu, return to this application's Settings and select your provider and model from the dropdowns.

### 4. OCR engine

The default OCR engine is PaddleOCR-VL, which produces accurate results for Korean manhwa. Manga OCR is Japanese-only and should not be used for Korean content. You can change the engine in Settings if needed.


## Usage

### Browsing and downloading

1. Go to Browse and search for a manhwa by name
2. Click a result to open its page
3. Use the download button on individual chapters or bulk-download from the chapter list
4. Downloaded chapters appear in your Library

### Translating

1. Open a manhwa and select chapters to translate
2. Click the translate button
3. The application will start Koharu in the background, upload the pages, run the full pipeline (text detection, bubble segmentation, OCR, LLM translation, inpainting, rendering), and save the translated images
4. Translated chapters are shown with a separate reader

### Translation batching

If you are using an API provider with rate limits, set the "Pages Per Batch" value in Settings. The application will process that many pages per pipeline job and wait 60 seconds between batches. Set it to 0 to process all pages in a single job.


## Settings reference

| Setting | Description |
|---|---|
| Curl Command | Browser curl export used to authenticate requests to Toonkor |
| Koharu Path | Path to the Koharu executable |
| Pages Per Batch | Number of pages per translation job. 0 means no limit |
| OCR Engine | Engine used to read text from pages. PaddleOCR-VL is recommended for Korean |
| LLM Mode | Whether to use a local model or an API provider |
| Provider | API provider to use for translation |
| Model | Specific model within the chosen provider or local catalog |


## Data storage

Application data is stored in the platform config directory:

- Windows: `%APPDATA%\ToonkorTranslate`
- macOS: `~/Library/Application Support/ToonkorTranslate`
- Linux: `~/.config/ToonkorTranslate`

Downloaded pages and translated images are stored under a `media` subdirectory within this folder.


## Development

### Prerequisites

- Go 1.25 or later
- Node.js 18 or later
- [Wails v3](https://v3.wails.io) CLI

### Running in development mode

```
wails3 dev
```

### Building

```
wails3 build
```

### Project structure

```
backend/
  backend.go          main backend entrypoint and Wails bindings
  database/           SQLite initialization and migrations
  models/             GORM models (Manhwa, Chapter, Settings)
  pipeline/           background workers (downloader, translator, cleaner)
  services/           HTTP clients (Toonkor scraper, Koharu API)
  utils/              shared helpers

frontend/
  src/
    components/       React components (NavBar, SettingsDrawer, etc.)
    contexts/         React context providers
    types/            TypeScript type definitions
    pages/            route-level page components
```
