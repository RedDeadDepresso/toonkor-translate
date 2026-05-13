package pipeline

import (
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"
	"toonkor-translate/backend/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type downloader struct {
	isRunning    bool
	eventManager *application.EventManager
}

func (d *downloader) Start() {
	if !d.isRunning {
		go d.downloadChapters()
		d.isRunning = true
	}
}

func (d *downloader) SetEventManager(eventManager *application.EventManager) {
	d.eventManager = eventManager
}

func (d *downloader) downloadChapters() {
	defer func() { d.isRunning = false }()

	for {
		var chapters []models.Chapter

		// 1. Fetch the next chapter queued for download.
		result := database.DB.
			Preload("Manhwa").
			Where("download_status = ?", models.Loading).
			Order("updated_at ASC, `index` ASC").
			Limit(1).
			Find(&chapters)

		if result.Error != nil {
			continue
		}

		if len(chapters) == 0 {
			break
		}

		chapter := chapters[0]

		// 2. Download the pages via the Toonkor service.
		_, err := services.ToonkorClient.DownloadChapter(&chapter)

		if err != nil {
			// Mark as not-ready so the user can retry.
			database.DB.Model(&chapter).Update("download_status", models.NotReady)
			d.emitChapter(&chapter)
			continue
		}

		// 3. Mark download as ready.
		database.DB.Model(&chapter).Update("download_status", models.Ready)
		d.emitChapter(&chapter)

		// 4. If the chapter was also queued for translation, kick the translator.
		if chapter.TranslationStatus == models.Loading {
			Translator.Start()
		}
	}
}

func (d *downloader) emitChapter(chapter *models.Chapter) {
	if d.eventManager != nil {
		d.eventManager.Emit(chapter.Manhwa.ToonkorID, *chapter)
	}
}

var Downloader downloader = downloader{}