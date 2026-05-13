package pipeline

import (
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"
	"toonkor-translate/backend/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type downloader struct {
	isRunning bool
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
	for (true) {
		var chapters []models.Chapter

		// 1. Fetch the first record matching criteria
		result := database.DB.
			Preload("Manhwa").
			Where("download_status = ?", models.Loading).
			Order("updated_at ASC, `index` ASC").
			Limit(1).
			Find(&chapters)

		// 2. Handle the "Not Found" case
		// GORM returns ErrRecordNotFound if no row matches

		if result.Error != nil {
			continue
		}

		if len(chapters) == 0 {
			break
		}

		chapter := chapters[0]

		// 3. Call the API/Downloader
		pagePaths, err := services.ToonkorClient.DownloadChapter(&chapter)

		if (err != nil) {
			database.DB.Model(&chapter).Update("download_status", models.Ready)
			d.emitChapter(&chapter)
			continue
		}

		// 4. Update the record if successful
		if len(pagePaths) > 0 {
			// Save the specific changes
			database.DB.Model(&chapter).Update("download_status", models.Ready)	
			d.emitChapter(&chapter)
		}
	}
	d.isRunning = false
}

func (d *downloader) emitChapter(chapter *models.Chapter) {
	if (d.eventManager != nil) {
		d.eventManager.Emit(chapter.Manhwa.ToonkorID, *chapter)
	}
}

var Downloader downloader = downloader{}