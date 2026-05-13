package services

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KoharuProject struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type KoharuPipelineResponse struct {
	OperationID string `json:"operationId"`
}

type KoharuJobEvent struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Error string `json:"error,omitempty"`
}

type KoharuLLMTarget struct {
	Kind       string `json:"kind"`
	ProviderID string `json:"providerId,omitempty"`
	ModelID    string `json:"modelId"`
}

type KoharuLLMRequest struct {
	Target  KoharuLLMTarget        `json:"target"`
	Options map[string]interface{} `json:"options,omitempty"`
}

type KoharuPipelineRequest struct {
	Steps          []string `json:"steps"`
	Pages          []string `json:"pages,omitempty"`
	TargetLanguage string   `json:"targetLanguage,omitempty"`
	SystemPrompt   string   `json:"systemPrompt,omitempty"`
	DefaultFont    string   `json:"defaultFont,omitempty"`
}

type KoharuExportRequest struct {
	Format string   `json:"format"`
	Pages  []string `json:"pages,omitempty"`
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type KoharuClientType struct {
	port    int
	process *exec.Cmd
	cancel  context.CancelFunc
}

var KoharuClient = &KoharuClientType{}

func (k *KoharuClientType) baseURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d/api/v1", k.port)
}

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

// Start launches Koharu in headless mode on a fixed port and waits until
// the /meta endpoint responds (bootstrapping complete).
func (k *KoharuClientType) Start(exePath string, port int) error {
	if k.process != nil {
		return nil
	}

	k.port = port
	ctx, cancel := context.WithCancel(context.Background())
	k.cancel = cancel

	cmd := exec.CommandContext(ctx, exePath,
		"--headless",
		"--port", fmt.Sprintf("%d", port),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("koharu: failed to start process: %w", err)
	}

	k.process = cmd

	if err := k.waitReady(60 * time.Second); err != nil {
		k.Stop()
		return err
	}

	log.Printf("koharu: ready at %s", k.baseURL())
	return nil
}

// Stop terminates the Koharu process.
func (k *KoharuClientType) Stop() {
	if k.cancel != nil {
		k.cancel()
		k.cancel = nil
	}
	if k.process != nil {
		_ = k.process.Wait()
		k.process = nil
	}
}

// IsRunning returns true if the Koharu process is active.
func (k *KoharuClientType) IsRunning() bool {
	return k.process != nil
}

// waitReady polls /meta until Koharu finishes bootstrapping.
func (k *KoharuClientType) waitReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := http.Get(k.baseURL() + "/meta")
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("koharu: timed out waiting for API to be ready")
}

// ---------------------------------------------------------------------------
// Engine discovery
// ---------------------------------------------------------------------------

// KoharuEngineCatalog maps stage names to their list of available engine IDs.
type KoharuEngineCatalog map[string]json.RawMessage

// GetEngines fetches the registered pipeline engines from Koharu.
func (k *KoharuClientType) GetEngines() (KoharuEngineCatalog, error) {
	resp, err := http.Get(k.baseURL() + "/engines")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("koharu: get engines returned %d: %s", resp.StatusCode, b)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	log.Printf("koharu: /engines raw response: %s", string(raw))

	var catalog KoharuEngineCatalog
	if err := json.Unmarshal(raw, &catalog); err != nil {
		return nil, fmt.Errorf("koharu: decode engines: %w", err)
	}
	return catalog, nil
}

// DefaultPipelineSteps queries /engines and builds an ordered slice using the
// first available engine id for each active pipeline stage:
// detectors → ocr → translators → inpainters → renderers
// Stages with no registered engines are skipped.
func (k *KoharuClientType) DefaultPipelineSteps() ([]string, error) {
	catalog, err := k.GetEngines()
	if err != nil {
		return nil, err
	}

	// Each catalog value is a JSON array of objects with at least an "id" field.
	// e.g. [{"id":"comic-text-detector","name":"...","produces":[...]}, ...]
	firstID := func(raw json.RawMessage) string {
		var entries []struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &entries); err != nil || len(entries) == 0 {
			return ""
		}
		return entries[0].ID
	}

	// Ordered stage keys as they appear in the /engines response, paired with
	// the steps argument name Koharu expects in POST /pipelines.
	// The pipeline steps use the engine "id" values directly.
	// Order matters: detector must run before segmenter (BubbleMask),
	// segmenter before inpainter, ocr+translator before renderer.
	type stageMapping struct{ catalogKey, pipelineKey string }
	ordered := []stageMapping{
		{"detectors", "detector"},
		{"bubbleSegmenters", "bubbleSegmenter"},
		{"ocr", "ocr"},
		{"translators", "translator"},
		{"inpainters", "inpainter"},
		{"renderers", "renderer"},
	}

	var steps []string
	for _, m := range ordered {
		raw, ok := catalog[m.catalogKey]
		if !ok {
			log.Printf("koharu: stage %q not in catalog, skipping", m.catalogKey)
			continue
		}
		id := firstID(raw)
		if id == "" {
			log.Printf("koharu: stage %q has no engine entries, skipping", m.catalogKey)
			continue
		}
		steps = append(steps, id)
	}

	if len(steps) == 0 {
		return nil, fmt.Errorf("koharu: no pipeline steps found in engine catalog")
	}
	log.Printf("koharu: pipeline steps: %v", steps)
	return steps, nil
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

func (k *KoharuClientType) CreateProject(name string) (*KoharuProject, error) {
	body, _ := json.Marshal(map[string]string{"name": name})
	resp, err := http.Post(k.baseURL()+"/projects", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("koharu: create project returned %d: %s", resp.StatusCode, b)
	}
	var project KoharuProject
	if err := json.NewDecoder(resp.Body).Decode(&project); err != nil {
		return nil, err
	}
	return &project, nil
}

func (k *KoharuClientType) OpenProject(id string) error {
	body, _ := json.Marshal(map[string]string{"id": id})
	req, _ := http.NewRequest(http.MethodPut, k.baseURL()+"/projects/current", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("koharu: open project returned %d: %s", resp.StatusCode, b)
	}
	return nil
}

func (k *KoharuClientType) CloseProject() error {
	req, _ := http.NewRequest(http.MethodDelete, k.baseURL()+"/projects/current", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// ---------------------------------------------------------------------------
// Page upload
// ---------------------------------------------------------------------------

// KoharuPage represents a page returned by the /pages endpoint.
type KoharuPage struct {
	ID string `json:"id"`
}

// UploadPages uploads image files as multipart form data.
// The response body shape varies by Koharu version; we only check the status code.
func (k *KoharuClientType) UploadPages(pageFiles []string) error {
	_, err := k.UploadPagesWithIDs(pageFiles)
	return err
}

// UploadPagesWithIDs uploads image files and returns the page IDs assigned by Koharu.
// The /pages endpoint returns an object or array containing page IDs; we try both shapes.
func (k *KoharuClientType) UploadPagesWithIDs(pageFiles []string) ([]KoharuPage, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	for _, p := range pageFiles {
		fw, err := mw.CreateFormFile("files", filepath.Base(p))
		if err != nil {
			return nil, err
		}
		f, err := os.Open(p)
		if err != nil {
			return nil, err
		}
		_, err = io.Copy(fw, f)
		f.Close()
		if err != nil {
			return nil, err
		}
	}
	mw.Close()

	resp, err := http.Post(k.baseURL()+"/pages", mw.FormDataContentType(), &buf)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("koharu: upload pages returned %d: %s", resp.StatusCode, raw)
	}

	// Try object with a pages field containing string IDs: {"pages":["id1","id2",...]}
	var wrapperStrings struct {
		Pages []string `json:"pages"`
	}
	if err := json.Unmarshal(raw, &wrapperStrings); err == nil && len(wrapperStrings.Pages) > 0 {
		result := make([]KoharuPage, len(wrapperStrings.Pages))
		for i, id := range wrapperStrings.Pages {
			result[i] = KoharuPage{ID: id}
		}
		log.Printf("koharu: got %d page IDs from upload", len(result))
		return result, nil
	}

	// Try array of page objects: [{"id":"..."},...]
	var pages []KoharuPage
	if err := json.Unmarshal(raw, &pages); err == nil && len(pages) > 0 {
		return pages, nil
	}

	// Try object with a pages field containing objects: {"pages":[{"id":"..."},...]}
	var wrapperObjects struct {
		Pages []KoharuPage `json:"pages"`
	}
	if err := json.Unmarshal(raw, &wrapperObjects); err == nil && len(wrapperObjects.Pages) > 0 {
		return wrapperObjects.Pages, nil
	}

	// Try scene snapshot with epoch: {"epoch":N,"scene":{...}}
	// In this case we have no page IDs — fall back to fetching the scene.
	var scene struct {
		Epoch int `json:"epoch"`
	}
	if err := json.Unmarshal(raw, &scene); err == nil && scene.Epoch > 0 {
		return k.fetchPageIDs()
	}

	// Give up — return empty (pipeline will run on all pages without explicit IDs)
	log.Printf("koharu: could not parse page IDs from /pages response, will run on all pages")
	return nil, nil
}

// fetchPageIDs reads the current scene and extracts all page IDs.
func (k *KoharuClientType) fetchPageIDs() ([]KoharuPage, error) {
	resp, err := http.Get(k.baseURL() + "/scene.json")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var scene struct {
		Scene struct {
			Pages []struct {
				ID string `json:"id"`
			} `json:"pages"`
		} `json:"scene"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&scene); err != nil {
		return nil, err
	}

	pages := make([]KoharuPage, len(scene.Scene.Pages))
	for i, p := range scene.Scene.Pages {
		pages[i] = KoharuPage{ID: p.ID}
	}
	return pages, nil
}

// ---------------------------------------------------------------------------
// LLM catalog
// ---------------------------------------------------------------------------

type KoharuLLMModel struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Family string `json:"family,omitempty"`
}

type KoharuLLMCatalog struct {
	Local    []KoharuLLMModel `json:"local"`
	Provider []KoharuLLMModel `json:"provider"`
}

// GetLLMCatalog returns available local and provider-backed LLM models.
func (k *KoharuClientType) GetLLMCatalog() (*KoharuLLMCatalog, error) {
	resp, err := http.Get(k.baseURL() + "/llm/catalog")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("koharu: get llm catalog returned %d: %s", resp.StatusCode, b)
	}
	var catalog KoharuLLMCatalog
	if err := json.NewDecoder(resp.Body).Decode(&catalog); err != nil {
		return nil, err
	}
	return &catalog, nil
}

// SetProviderAPIKey saves an API key for the given provider via Koharu's config endpoint.
func (k *KoharuClientType) SetProviderAPIKey(providerID, apiKey string) error {
	body, _ := json.Marshal(map[string]string{"secret": apiKey})
	req, _ := http.NewRequest(http.MethodPut,
		fmt.Sprintf("%s/config/providers/%s/secret", k.baseURL(), providerID),
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("koharu: set provider key returned %d: %s", resp.StatusCode, b)
	}
	return nil
}

// ---------------------------------------------------------------------------
// LLM loading
// ---------------------------------------------------------------------------

// LoadLLM queues a model load. The actual ready state is signalled via /events.
func (k *KoharuClientType) LoadLLM(req KoharuLLMRequest) error {
	body, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest(http.MethodPut, k.baseURL()+"/llm/current", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("koharu: load LLM returned %d: %s", resp.StatusCode, b)
	}
	return nil
}

// WaitForLLMReady polls /llm/current until status is "ready" or an error occurs.
func (k *KoharuClientType) WaitForLLMReady(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("koharu: timed out waiting for LLM to load")
		default:
		}

		resp, err := http.Get(k.baseURL() + "/llm/current")
		if err != nil {
			time.Sleep(1 * time.Second)
			continue
		}

		var state struct {
			Status string `json:"status"`
			Error  string `json:"error"`
		}
		err = json.NewDecoder(resp.Body).Decode(&state)
		resp.Body.Close()

		if err != nil {
			time.Sleep(1 * time.Second)
			continue
		}

		log.Printf("koharu: LLM status: %s", state.Status)

		switch state.Status {
		case "ready":
			return nil
		case "error":
			return fmt.Errorf("koharu: LLM load failed: %s", state.Error)
		}

		time.Sleep(2 * time.Second)
	}
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

// RunPipeline starts a pipeline and returns the operation ID.
func (k *KoharuClientType) RunPipeline(req KoharuPipelineRequest) (string, error) {
	body, _ := json.Marshal(req)
	resp, err := http.Post(k.baseURL()+"/pipelines", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("koharu: run pipeline returned %d: %s", resp.StatusCode, b)
	}
	var pr KoharuPipelineResponse
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return "", err
	}
	return pr.OperationID, nil
}

// ---------------------------------------------------------------------------
// Event stream
// ---------------------------------------------------------------------------

// WaitForJob polls /operations until the given operationId is finished or failed.
func (k *KoharuClientType) WaitForJob(ctx context.Context, operationID string, onProgress func(string)) error {
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("koharu: timed out waiting for job %s", operationID)
		default:
		}

		resp, err := http.Get(k.baseURL() + "/operations")
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		type opEntry struct {
			ID     string `json:"id"`
			Status string `json:"status"`
			Error  string `json:"error"`
		}
		var body struct {
			Operations []opEntry `json:"operations"`
		}
		rawBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err := json.Unmarshal(rawBody, &body); err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		ops := body.Operations

		found := false
		for _, op := range ops {
			if op.ID != operationID {
				continue
			}
			found = true
			if onProgress != nil {
				onProgress(op.Status)
			}
			log.Printf("koharu: job %s status: %s", operationID, op.Status)
			switch op.Status {
			case "completed", "completed_with_errors":
				return nil
			case "failed", "error", "cancelled":
				return fmt.Errorf("koharu: job failed: %s", op.Error)
			// "running" and anything else — keep polling
			}
		}

		if !found {
			// Operation scrolled out of the registry — treat as completed.
			log.Printf("koharu: job %s not found in operations, assuming complete", operationID)
			return nil
		}

		time.Sleep(2 * time.Second)
	}
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// ExportRendered exports the current project as rendered images and extracts
// them into destDir. Returns the list of extracted file paths.
func (k *KoharuClientType) ExportRendered(destDir string) ([]string, error) {
	body, _ := json.Marshal(KoharuExportRequest{Format: "rendered"})
	resp, err := http.Post(k.baseURL()+"/projects/current/export", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("koharu: export returned %d: %s", resp.StatusCode, b)
	}

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "zip") {
		return extractZipResponse(resp.Body, destDir)
	}

	// Single image response.
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return nil, err
	}
	outPath := filepath.Join(destDir, "1.png")
	f, err := os.Create(outPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		return nil, err
	}
	return []string{outPath}, nil
}

// extractZipResponse reads a ZIP response body and extracts it to destDir.
func extractZipResponse(body io.Reader, destDir string) ([]string, error) {
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}

	tmp, err := os.CreateTemp("", "koharu-export-*.zip")
	if err != nil {
		return nil, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return nil, err
	}
	tmp.Close()

	return unzipToDir(tmpName, destDir)
}

// unzipToDir extracts a zip archive into dest and returns extracted file paths.
func unzipToDir(src, dest string) ([]string, error) {
	r, err := zip.OpenReader(src)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	if err := os.MkdirAll(dest, 0o755); err != nil {
		return nil, err
	}

	var paths []string
	for _, f := range r.File {
		outPath := filepath.Join(dest, filepath.Base(f.Name))
		if f.FileInfo().IsDir() {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		out, err := os.Create(outPath)
		if err != nil {
			rc.Close()
			return nil, err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return nil, err
		}
		paths = append(paths, outPath)
	}
	return paths, nil
}