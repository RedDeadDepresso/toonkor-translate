package backend

import (
	"fmt"
	"log"
	"time"
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"
	"toonkor-translate/backend/pipeline"
	"toonkor-translate/backend/services"
	"toonkor-translate/backend/utils"

	"github.com/pkg/browser"
	"github.com/wailsapp/wails/v3/pkg/application"
	"gorm.io/gorm/clause"
)

type Backend struct {
	app *application.App
}

func NewBackend() *Backend {
	database.Init(&models.Settings{}, &models.Manhwa{}, &models.Chapter{})
	err := database.DB.AutoMigrate(&models.Settings{}, &models.Manhwa{}, &models.Chapter{}) 
		if err != nil {
			log.Fatal("Failed to migrate database:", err)
		}
	settings := models.MainSettings()
	services.ToonkorClient.SetCurlCommand(settings.CurlCommand)
	pipeline.Downloader.Start()
	pipeline.Translator.Start()
	pipeline.Cleaner.Start()
	return &Backend{}
}

func SetApp(b *Backend, app *application.App) {
	b.app = app
	setEventManager(app.Event)
}

func setEventManager(eventManager *application.EventManager) {
	pipeline.Downloader.SetEventManager(eventManager)
	pipeline.Translator.SetEventManager(eventManager)
	pipeline.Cleaner.SetEventManager(eventManager)
}

func (b *Backend) Library() []models.Manhwa {
	var manhwas []models.Manhwa
	database.DB.Where("in_library = ?", true).Find(&manhwas)
	return manhwas
}

func (b *Backend) Browse(query string) ([]models.Manhwa, error) {
	if services.IsValidURL(query) {
		toonkorID := services.ExtractToonkorURL(query)
		if (toonkorID != "") {
			result, err := services.GetManhwaDetails(toonkorID)
			results := []models.Manhwa{*result}
			return results, err
		}
		mangadexID := services.ExtractMangadexURL(query)
		if (mangadexID != "") {
			results, err := services.MangaDexClient.SearchByID(mangadexID)
			if (err == nil) {
				results, err = services.ToonkorClient.MultiUpdateMangadexSearch(results)
			}
			return results, err
		}
	}
	results, err := services.MangaDexClient.Search(query)
	if (err == nil) {
		if (len(results) == 0) {
			results, err = services.ToonkorClient.Search(query)
		} else {
			results, err = services.ToonkorClient.MultiUpdateMangadexSearch(results)
		}
	}
	return results, err
}

func (b *Backend) GetManhwa(ToonkorID string) (models.Manhwa, error) {
	manhwa, err := services.GetManhwaDetails(ToonkorID)
	if (err != nil) {
		return models.Manhwa{}, err
	} 
	return *manhwa, err
}

func (b *Backend) AddManhwa(ToonkorID string) bool {
	added, _, _ := services.AddManhwaToLibrary(ToonkorID)
	return added
}

func (b *Backend) RemoveManhwa(ToonkorID string) bool {
	return services.RemoveManhwaFromLibrary(ToonkorID)
}

func (b *Backend) GetSettings() models.Settings {
	settings := models.MainSettings()
	return *settings
}

func (b *Backend) SetSettings(curlCommand string, koharuPath string, translationPageLimit uint, llmKind string, llmProviderID string, llmModelID string, ocrEngine string) (models.Settings, error) {
	if (!services.ToonkorClient.TestCurlCommand(curlCommand)) {
		err := fmt.Errorf("Invalid curl command")
		return models.Settings{}, err
	}
	if (!utils.FileExists(koharuPath)) {
		err := fmt.Errorf("Koharu Path doesn't exist")
		return models.Settings{}, err
	}
	services.ToonkorClient.SetCurlCommand(curlCommand)
	services.ResetStartTime()
	settings := models.Settings{}
	database.DB.Where(models.Settings{Name: "main"}).
		Assign(models.Settings{
			CurlCommand:          curlCommand,
			KoharuPath:           koharuPath,
			TranslationPageLimit: translationPageLimit,
			ToonkorURL:           services.ToonkorClient.GetBaseURL(),
			LLMKind:              llmKind,
			LLMProviderID:        llmProviderID,
			LLMModelID:           llmModelID,
			OCREngine:            ocrEngine,
		}).
		FirstOrCreate(&settings)
	return settings, nil
}

type LLMModel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type LLMProvider struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	RequiresAPIKey bool       `json:"requiresApiKey"`
	HasAPIKey      bool       `json:"hasApiKey"`
	Status         string     `json:"status"`
	Models         []LLMModel `json:"models"`
}

type LLMCatalog struct {
	Local     []LLMModel    `json:"local"`
	Providers []LLMProvider `json:"providers"`
}

func (b *Backend) GetLLMCatalog() (LLMCatalog, error) {
	settings := models.MainSettings()
	if !services.KoharuClient.IsRunning() {
		if settings.KoharuPath == "" {
			return LLMCatalog{}, fmt.Errorf("Koharu path not configured")
		}
		if err := services.KoharuClient.Start(settings.KoharuPath, 17173); err != nil {
			return LLMCatalog{}, err
		}
	}
	catalog, err := services.KoharuClient.GetLLMCatalog()
	if err != nil {
		return LLMCatalog{}, err
	}

	result := LLMCatalog{}

	for _, m := range catalog.LocalModels {
		result.Local = append(result.Local, LLMModel{
			ID:   m.Target.ModelID,
			Name: m.Name,
		})
	}

	for _, p := range catalog.Providers {
		provider := LLMProvider{
			ID:             p.ID,
			Name:           p.Name,
			RequiresAPIKey: p.RequiresAPIKey,
			HasAPIKey:      p.HasAPIKey,
			Status:         p.Status,
		}
		for _, m := range p.Models {
			provider.Models = append(provider.Models, LLMModel{
				ID:   m.Target.ModelID,
				Name: m.Name,
			})
		}
		result.Providers = append(result.Providers, provider)
	}

	return result, nil
}

func (b *Backend) DownloadChapters(chapters []models.Chapter, translation bool) ([]models.Chapter, bool) {
	var toonkorIDs []string
	for _, c := range chapters {
		toonkorIDs = append(toonkorIDs, c.ToonkorID)
	}

	// 1. Prepare the fields for update
	fields := map[string]interface{}{
		"download_status": models.Loading,
		"updated_at":      time.Now(),
	}

	if translation {
		fields["translation_status"] = models.Loading
	}

	// 2. Prepare a slice to hold the updated data
	var updatedChapters []models.Chapter

	// 3. Execute the Update with a Returning clause
	// .Scan() is used instead of .Error to capture the returning rows
	err := database.DB.Model(&models.Chapter{}).
		Clauses(clause.Returning{}).
		Where("toonkor_id IN ?", toonkorIDs).
		Updates(fields).
		Scan(&updatedChapters).Error

	if err != nil {
		log.Printf("Error updating chapters: %v", err)
		return nil, false
	}

	// 4. Start the downloader pipeline
	pipeline.Downloader.Start()

	// Return the fresh data from the DB and success status
	return updatedChapters, true
}

func (b *Backend) DeleteChapters(chapters []models.Chapter, translation bool) ([]models.Chapter, bool) {
	var toonkorIDs []string
	for _, c := range chapters {
		toonkorIDs = append(toonkorIDs, c.ToonkorID)
	}

	// 1. Prepare the fields for update
	fields := map[string]interface{}{
		"download_status": models.Removing,
		"updated_at":      time.Now(),
	}

	if translation {
		fields["translation_status"] = models.Removing
	}

	// 2. Prepare a slice to hold the updated data
	var updatedChapters []models.Chapter

	// 3. Execute the Update with a Returning clause
	// .Scan() is used instead of .Error to capture the returning rows
	err := database.DB.Model(&models.Chapter{}).
		Clauses(clause.Returning{}).
		Where("toonkor_id IN ?", toonkorIDs).
		Updates(fields).
		Scan(&updatedChapters).Error

	if err != nil {
		log.Printf("Error updating chapters: %v", err)
		return nil, false
	}

	// 4. Start the downloader pipeline
	pipeline.Cleaner.Start()

	// Return the fresh data from the DB and success status
	return updatedChapters, true
}

func (b *Backend) GetChapter(toonkorID string, choice models.ChapterChoice) (models.ChapterDetails, error) {
    var chapter models.Chapter
    
    // 1. Explicit query string and handle Preload
    err := database.DB.
        Preload("Manhwa").
        Where("toonkor_id = ?", toonkorID). 
        First(&chapter).Error
    
    if err != nil {
        return models.ChapterDetails{}, err
    }

    // 2. Fetch Manhwa details from service
    manhwa, err := services.GetManhwaDetails(chapter.Manhwa.ToonkorID)
    if err != nil {
        return models.ChapterDetails{}, err
    }

    // 3. Logic for Navigation (Safe indexing)
    var prevChapter, nextChapter *models.Chapter // Assuming this is the return type
    if chapter.Index > 1 {
        prevChapter = services.ChapterFromIndex(manhwa, chapter.Index-1)
    }
    nextChapter = services.ChapterFromIndex(manhwa, chapter.Index+1)

    // 4. Determine which pages to show
    var pages []string
    if choice == models.Downloaded {
        // Optional: Check status before scanning disk
        if chapter.DownloadStatus == models.Ready {
            pages = chapter.MediaDownloadPages()
        }
    } else {
        if chapter.TranslationStatus == models.Ready {
            pages = chapter.MediaTranslationPages()
        }
    }

    return models.ChapterDetails{
        ManhwaID:      manhwa.ToonkorID,
        ManhwaTitle:   manhwa.Title,
        ManhwaEnTitle: manhwa.EnTitle,
        PrevChapter:   prevChapter,
        NextChapter:   nextChapter,
		CurrentChapter: &chapter,
        Pages:         pages,
    }, nil
}

func (b *Backend) SelectKoharuPath() string {
	if (b.app == nil) {
		return ""
	}

	path, err := b.app.Dialog.OpenFile().
    SetTitle("Select Koharu Executable File").
    AddFilter("Executables", "*.exe;*.app;*").
    PromptForSingleSelection()

	if (err != nil) {
		return ""
	}
	
	return path
}

func (b *Backend) BrowserOpenURL(url string) {
	browser.OpenURL(url)
}

func (b *Backend) OpenKoharu() error {
	settings := models.MainSettings()
	if settings.KoharuPath == "" {
		return fmt.Errorf("Koharu path not configured")
	}
	if !services.KoharuClient.IsRunning() {
		if err := services.KoharuClient.Start(settings.KoharuPath, services.KoharuPort); err != nil {
			return err
		}
	}
	browser.OpenURL(fmt.Sprintf("http://127.0.0.1:%d", 17173))
	return nil
}