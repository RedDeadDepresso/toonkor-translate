package pipeline

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"
	"toonkor-translate/backend/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	koharuPort        = 17173
	koharuProjectName = "toonkor-translate"
)

type translator struct {
	isRunning    bool
	eventManager *application.EventManager
}

func (t *translator) Start() {
	if !t.isRunning {
		go t.translateChapters()
		t.isRunning = true
	}
}

func (t *translator) SetEventManager(eventManager *application.EventManager) {
	t.eventManager = eventManager
}

// translateChapters is the main goroutine loop. It picks one chapter at a time
// whose translation_status is Loading, runs the full Koharu pipeline on it,
// and writes the rendered output to the chapter's TranslationPath.
func (t *translator) translateChapters() {
	defer func() { t.isRunning = false }()

	for {
		// ----------------------------------------------------------------
		// 1. Fetch next chapter queued for translation
		// ----------------------------------------------------------------
		var chapters []models.Chapter
		result := database.DB.
			Preload("Manhwa").
			Where("translation_status = ? AND download_status = ?", models.Loading, models.Ready).
			Order("updated_at ASC, `index` ASC").
			Limit(1).
			Find(&chapters)

		if result.Error != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if len(chapters) == 0 {
			// No work right now — check if there are chapters still downloading
			// that will need translation once ready.
			var pending int64
			database.DB.Model(&models.Chapter{}).
				Where("translation_status = ? AND download_status = ?", models.Loading, models.Loading).
				Count(&pending)
			if pending == 0 {
				// Nothing in progress either — exit the goroutine.
				log.Printf("translator: no pending chapters, stopping")
				break
			}
			// Downloads still in flight; wait and check again.
			time.Sleep(3 * time.Second)
			continue
		}

		chapter := chapters[0]
		log.Printf("translator: starting chapter %s (id=%d)", chapter.ToonkorID, chapter.ID)

		// ----------------------------------------------------------------
		// 2. Translate the chapter via Koharu
		// ----------------------------------------------------------------
		err := t.translateChapter(&chapter)
		if err != nil {
			log.Printf("translator: chapter %s failed: %v", chapter.ToonkorID, err)
			database.DB.Model(&models.Chapter{}).
				Where("id = ?", chapter.ID).
				Update("translation_status", models.NotReady)
		} else {
			log.Printf("translator: chapter %s succeeded, marking Ready", chapter.ToonkorID)
			database.DB.Model(&models.Chapter{}).
				Where("id = ?", chapter.ID).
				Update("translation_status", models.Ready)
		}

		t.emitChapter(&chapter)
	}
}

// translateChapter runs the full Koharu pipeline for a single chapter.
func (t *translator) translateChapter(chapter *models.Chapter) error {
	settings := models.MainSettings()

	// ----------------------------------------------------------------
	// 2a. Ensure Koharu is running
	// ----------------------------------------------------------------
	if !services.KoharuClient.IsRunning() {
		if settings.KoharuPath == "" {
			return fmt.Errorf("translator: KoharuPath is not configured")
		}
		if err := services.KoharuClient.Start(settings.KoharuPath, koharuPort); err != nil {
			return fmt.Errorf("translator: could not start Koharu: %w", err)
		}
	}

	// ----------------------------------------------------------------
	// 2b. Collect downloaded page files for this chapter
	// ----------------------------------------------------------------
	pageFiles := chapter.DownloadPages()
	if len(pageFiles) == 0 {
		return fmt.Errorf("translator: no downloaded pages found for chapter %s", chapter.ToonkorID)
	}

	// Koharu's natural-sort import order must match our disk order.
	sort.Strings(pageFiles)

	// ----------------------------------------------------------------
	// 2c. Create / open a dedicated Koharu project for this chapter
	// ----------------------------------------------------------------
	projectName := fmt.Sprintf("%s-%d", sanitize(chapter.Manhwa.Title), chapter.Index)
	project, err := services.KoharuClient.CreateProject(projectName)
	if err != nil {
		return fmt.Errorf("translator: create project: %w", err)
	}

	if err := services.KoharuClient.OpenProject(project.ID); err != nil {
		return fmt.Errorf("translator: open project: %w", err)
	}
	defer func() {
		if cerr := services.KoharuClient.CloseProject(); cerr != nil {
			log.Printf("translator: close project: %v", cerr)
		}
	}()

	// ----------------------------------------------------------------
	// 2d. Upload all pages at once
	// ----------------------------------------------------------------
	uploadedPages, err := services.KoharuClient.UploadPagesWithIDs(pageFiles)
	if err != nil {
		return fmt.Errorf("translator: upload pages: %w", err)
	}
	log.Printf("translator: uploaded %d pages", len(uploadedPages))

	// ----------------------------------------------------------------
	// 2e. Load the LLM configured in settings
	// ----------------------------------------------------------------
	llmReq := services.KoharuLLMRequest{
		Target: services.KoharuLLMTarget{
			Kind:    settings.LLMKind,
			ModelID: settings.LLMModelID,
		},
	}
	if settings.LLMKind == "provider" {
		llmReq.Target.ProviderID = settings.LLMProviderID
		if settings.LLMApiKey != "" {
			if err := services.KoharuClient.SetProviderAPIKey(settings.LLMProviderID, settings.LLMApiKey); err != nil {
				log.Printf("translator: set provider API key: %v", err)
			}
		}
	}

	if err := services.KoharuClient.LoadLLM(llmReq); err != nil {
		return fmt.Errorf("translator: load LLM: %w", err)
	}

	llmCtx, llmCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer llmCancel()
	if err := services.KoharuClient.WaitForLLMReady(llmCtx); err != nil {
		return fmt.Errorf("translator: LLM not ready: %w", err)
	}

	// ----------------------------------------------------------------
	// 2f. Discover pipeline steps
	// ----------------------------------------------------------------
	steps, err := services.KoharuClient.DefaultPipelineSteps()
	if err != nil {
		return fmt.Errorf("translator: discover pipeline steps: %w", err)
	}

	// ----------------------------------------------------------------
	// 2g. Run pipeline in rate-limited batches
	//     If TranslationPageLimit == 0, process all pages in one job.
	//     Otherwise, run batches of that size with a 60s gap between
	//     batches to stay within API rate limits.
	// ----------------------------------------------------------------
	pageIDs := make([]string, len(uploadedPages))
	for i, p := range uploadedPages {
		pageIDs[i] = p.ID
	}

	batchSize := int(settings.TranslationPageLimit)
	if batchSize <= 0 || len(pageIDs) == 0 {
		// Either no rate limit set, or we couldn't get page IDs —
		// run a single pipeline job covering all pages.
		batchSize = len(pageIDs)
		if batchSize == 0 {
			batchSize = len(pageFiles) // fallback: no IDs means run on all
		}
	}

	for batchStart := 0; batchStart < len(pageIDs); batchStart += batchSize {
		batchEnd := batchStart + batchSize
		if batchEnd > len(pageIDs) {
			batchEnd = len(pageIDs)
		}
		batch := pageIDs[batchStart:batchEnd]

		log.Printf("translator: running pipeline for pages %d–%d of %d", batchStart+1, batchEnd, len(pageIDs))

		req := services.KoharuPipelineRequest{
			Steps:          steps,
			TargetLanguage: "en",
		}
		if len(pageIDs) > 0 {
			req.Pages = batch
		}

		opID, err := services.KoharuClient.RunPipeline(req)
		if err != nil {
			return fmt.Errorf("translator: run pipeline batch %d: %w", batchStart, err)
		}

		jobCtx, jobCancel := context.WithTimeout(context.Background(), 30*time.Minute)
		err = services.KoharuClient.WaitForJob(jobCtx, opID, func(status string) {
			log.Printf("translator: chapter %s batch %d–%d: %s", chapter.ToonkorID, batchStart+1, batchEnd, status)
		})
		jobCancel()
		if err != nil {
			return fmt.Errorf("translator: pipeline batch %d: %w", batchStart, err)
		}

		// If there are more batches, wait 60 seconds to respect API rate limits.
		if batchEnd < len(pageIDs) {
			log.Printf("translator: rate limit pause 60s before next batch")
			time.Sleep(60 * time.Second)
		}
	}

	// ----------------------------------------------------------------
	// 2g. Export rendered images into TranslationPath
	// ----------------------------------------------------------------
	destDir := chapter.TranslationPath()
	log.Printf("translator: exporting rendered pages to %s", destDir)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("translator: mkdir translation path: %w", err)
	}

	exportedPaths, err := services.KoharuClient.ExportRendered(destDir)
	if err != nil {
		return fmt.Errorf("translator: export rendered: %w", err)
	}
	log.Printf("translator: exported %d files", len(exportedPaths))

	// Rename exported files to numeric names (1.png, 2.png …) so the
	// existing mediaPages scanner picks them up correctly.
	if err := renameToNumeric(exportedPaths, destDir); err != nil {
		log.Printf("translator: rename exported files: %v", err)
	}

	return nil
}

// renameToNumeric renames a sorted list of exported files to 1.ext, 2.ext …
func renameToNumeric(paths []string, dir string) error {
	sort.Strings(paths)
	for i, p := range paths {
		ext := filepath.Ext(p)
		newName := filepath.Join(dir, fmt.Sprintf("%d%s", i+1, ext))
		if p == newName {
			continue
		}
		if err := os.Rename(p, newName); err != nil {
			return err
		}
	}
	return nil
}

// sanitize removes characters that are unsafe in Koharu project names.
func sanitize(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == ' ' {
			b.WriteRune('-')
		} else if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "chapter"
	}
	return b.String()
}

func (t *translator) emitChapter(chapter *models.Chapter) {
	if t.eventManager != nil {
		t.eventManager.Emit(chapter.Manhwa.ToonkorID, *chapter)
	}
}

var Translator translator = translator{}