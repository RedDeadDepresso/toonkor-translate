package pipeline

import (
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type cleaner struct {
	isRunning    bool
	eventManager *application.EventManager
}

func (c *cleaner) Start() {
	if !c.isRunning {
		go c.removeChapters()
		c.isRunning = true
	}
}

func (c *cleaner) SetEventManager(eventManager *application.EventManager) {
	c.eventManager = eventManager
}

func (c *cleaner) removeChapters() {
	for (true) {
		var chapters []models.Chapter
		
		// 1. Fetch the first record matching criteria
		result := database.DB.
			Preload("Manhwa").
			// The "OR" logic goes inside the Where clause
			Where("download_status = ? OR translation_status = ?", models.Removing, models.Removing).
			Order("updated_at DESC, `index` ASC"). 
			Limit(1).
			Find(&chapters)

			if result.Error != nil {
				continue
			}

			if len(chapters) == 0 {
				break
			}

			chapter := chapters[0]

		if (chapter.DownloadStatus == models.Removing) {
			chapter.DeleteDownload()
			database.DB.Model(&chapter).Update("download_status", models.NotReady)
			c.emitChapter(&chapter)
		}

		if (chapter.TranslationStatus == models.Removing) {
			chapter.DeleteTranslation()
			database.DB.Model(&chapter).Update("translation_status", models.NotReady)
			c.emitChapter(&chapter)
		}
	}
	c.isRunning = false
}

func (c *cleaner) emitChapter(chapter *models.Chapter) {
	if (c.eventManager != nil) {
		c.eventManager.Emit(chapter.Manhwa.ToonkorID, *chapter)
	}
}

var Cleaner cleaner = cleaner{}