package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"
	"toonkor-translate/backend/models"
)


type MangaDexResponse struct {
	Data interface{} `json:"data"`
}

type MangaDexManga struct {
	ID         string `json:"id"`
	Attributes struct {
		Title map[string]string `json:"title"`

		Description map[string]string `json:"description"`

		AltTitles []map[string]string `json:"altTitles"`
	} `json:"attributes"`
}

type mangaDexClient struct {
	client   *http.Client
	headers  map[string]string
	baseURL  string
}

func newMangaDexClient() *mangaDexClient {
	return &mangaDexClient{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},

		baseURL: "https://api.mangadex.org",

		headers: map[string]string{
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
		},
	}
}

func (m *mangaDexClient) doRequest(
	ctx context.Context,
	targetURL string,
) (*http.Response, error) {

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		targetURL,
		nil,
	)

	if err != nil {
		return nil, err
	}

	for k, v := range m.headers {
		req.Header.Set(k, v)
	}

	return m.client.Do(req)
}

func (m *mangaDexClient) extractResponse(
	resp *http.Response,
) ([]models.Manhwa, error) {

	defer resp.Body.Close()

	var raw MangaDexResponse

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	results := make([]MangaDexManga, 0)

	switch data := raw.Data.(type) {

	case []interface{}:
		for _, item := range data {
			bytes, _ := json.Marshal(item)

			var manga MangaDexManga

			if err := json.Unmarshal(bytes, &manga); err == nil {
				results = append(results, manga)
			}
		}

	case map[string]interface{}:
		bytes, _ := json.Marshal(data)

		var manga MangaDexManga

		if err := json.Unmarshal(bytes, &manga); err == nil {
			results = append(results, manga)
		}
	}

	output := make([]models.Manhwa, 0)

	for _, result := range results {

		koreanTitle := ""
		enTitle := ""

		// Scan all altTitles independently — "ko" and "en" are in separate objects.
		for _, altTitle := range result.Attributes.AltTitles {
			if ko, exists := altTitle["ko"]; exists && koreanTitle == "" {
				koreanTitle = ko
			}
			if en, exists := altTitle["en"]; exists && enTitle == "" {
				enTitle = en
			}
		}

		if koreanTitle == "" {
			continue
		}

		// attributes.title["en"] takes priority over altTitles if present.
		if result.Attributes.Title["en"] != "" {
			enTitle = result.Attributes.Title["en"]
		}

		temp := models.Manhwa{
			Title:         koreanTitle,
			EnTitle:       enTitle,
			EnDescription: result.Attributes.Description["en"],
			MangaDexID:    result.ID,
		}

		output = append(output, temp)
	}

	return output, nil
}

func (m *mangaDexClient) Search(
	query string,
) ([]models.Manhwa, error) {

	params := url.Values{}
	params.Set("title", query)

	searchURL := fmt.Sprintf(
		"%s/manga?%s",
		m.baseURL,
		params.Encode(),
	)

	resp, err := m.doRequest(
		context.Background(),
		searchURL,
	)

	if err != nil {
		return nil, err
	}

	return m.extractResponse(resp)
}

func (m *mangaDexClient) SearchByID(
	id string,
) ([]models.Manhwa, error) {

	searchURL := fmt.Sprintf(
		"%s/manga/%s",
		m.baseURL,
		id,
	)

	resp, err := m.doRequest(
		context.Background(),
		searchURL,
	)

	if err != nil {
		return nil, err
	}

	return m.extractResponse(resp)
}

func (m *mangaDexClient) UpdateToonkorSearch(
	toonkorSearch models.Manhwa,
) (models.Manhwa, error) {

	params := url.Values{}
	params.Set("title", toonkorSearch.Title)

	searchURL := fmt.Sprintf(
		"%s/manga?%s",
		m.baseURL,
		params.Encode(),
	)

	resp, err := m.doRequest(
		context.Background(),
		searchURL,
	)

	if err != nil {
		return toonkorSearch, err
	}

	results, err := m.extractResponse(resp)
	if err != nil {
		return toonkorSearch, err
	}

	if len(results) > 0 {

		toonkorSearch.EnTitle = results[0].EnTitle
		toonkorSearch.EnDescription = results[0].EnDescription
		toonkorSearch.MangaDexID = results[0].MangaDexID
	}

	return toonkorSearch, nil
}

func (m *mangaDexClient) MultiUpdateToonkorSearch(
	toonkorResults []models.Manhwa,
) ([]models.Manhwa, error) {

	var wg sync.WaitGroup
	var mu sync.Mutex

	output := make([]models.Manhwa, 0)

	errorChan := make(chan error, len(toonkorResults))

	for _, result := range toonkorResults {

		wg.Add(1)

		go func(r models.Manhwa) {
			defer wg.Done()

			updated, err := m.UpdateToonkorSearch(r)

			if err != nil {
				errorChan <- err
				return
			}

			mu.Lock()
			output = append(output, updated)
			mu.Unlock()

		}(result)
	}

	wg.Wait()
	close(errorChan)

	for err := range errorChan {
		if err != nil {
			return output, err
		}
	}

	return output, nil
}


var MangaDexClient = newMangaDexClient()