package services

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"
	"toonkor-translate/backend/utils"

	"github.com/PuerkitoBio/goquery"
)

type Page struct {
	Index int    `json:"index"`
	URL   string `json:"url"`
}

type toonkorClient struct {
	client     *http.Client
	baseURL    string
	headers    map[string]string
	cookies    []*http.Cookie
}

func newToonkorClient() *toonkorClient {
	jar, _ := cookiejar.New(nil)

	return &toonkorClient{
		client: &http.Client{
			Jar:     jar,
			Timeout: 30 * time.Second,
		},
		baseURL: "https://tkor116.com",
		headers: map[string]string{
			"User-Agent": "Mozilla/5.0",
		},
	}
}

func (t *toonkorClient) GetBaseURL() string {
	return t.baseURL
}

func (t *toonkorClient) doRequest(
	ctx context.Context,
	method string,
	targetURL string,
) (*http.Response, error) {

	req, err := http.NewRequestWithContext(ctx, method, targetURL, nil)
	if err != nil {
		return nil, err
	}

	for k, v := range t.headers {
		req.Header.Set(k, v)
	}

	for _, cookie := range t.cookies {
		req.AddCookie(cookie)
	}

	return t.client.Do(req)
}

func (t *toonkorClient) Search(query string) ([]models.Manhwa, error) {
	searchURL := fmt.Sprintf(
		"%s/bbs/search.php?sfl=wr_subject%%7C%%7Cwr_content&stx=%s",
		t.baseURL,
		url.QueryEscape(query),
	)

	resp, err := t.doRequest(context.Background(), http.MethodGet, searchURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	results := make([]models.Manhwa, 0)

	doc.Find("div.section-item-inner").Each(func(i int, s *goquery.Selection) {
		result, err := t.parseMangaElement(s)
		if err == nil {
			results = append(results, result)
		}
	})

	return results, nil
}

func (t *toonkorClient) parseMangaElement(
	s *goquery.Selection,
) (models.Manhwa, error) {

	title := strings.TrimSpace(
		s.Find("div.section-item-title a h3").Text(),
	)

	toonkorID, exists := s.Find("div.section-item-title a").Attr("href")
	if !exists {
		return models.Manhwa{}, errors.New("missing href")
	}

	thumbnail, _ := s.Find("img").Attr("src")

	parsed, err := url.Parse(thumbnail)
	if err != nil {
		return models.Manhwa{}, err
	}

	toonkorID = strings.TrimPrefix(toonkorID, "/")

	return models.Manhwa{
		Title:     title,
		ToonkorID: toonkorID,
		Thumbnail: t.baseURL + "/" + parsed.Path,
	}, nil
}

func (t *toonkorClient) GetManhwaDetails(
	toonkorID string,
	chaptersDB map[int]models.Chapter,
) (*models.Manhwa, []models.Chapter, error) {

	manhwaURL := t.baseURL + "/" + toonkorID

	resp, err := t.doRequest(
		context.Background(),
		http.MethodGet,
		manhwaURL,
	)

	if err != nil {
		return nil, nil, err
	}

	defer resp.Body.Close()

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, nil, err
	}

	title := strings.TrimSpace(
		doc.Find("td.bt_title").Text(),
	)

	author := strings.TrimSpace(
		doc.Find("td.bt_label span.bt_data").
			First().
			Text(),
	)

	description := strings.TrimSpace(
		doc.Find("td.bt_over").Text(),
	)

	thumbnail, _ := doc.
		Find("td.bt_thumb img").
		Attr("src")

	manhwa := &models.Manhwa{
		Title:       title,
		Author:      author,
		Description: description,
		Thumbnail:   t.baseURL + "/" + thumbnail,
		ToonkorID:   toonkorID,
	}

	// collect chapter rows first
	rows := make([]*goquery.Selection, 0)

	doc.Find(
		"table.web_list tr",
	).Each(func(i int, s *goquery.Selection) {

		if s.Find("td.content__title").Length() > 0 {
			rows = append(rows, s)
		}
	})

	// reverse rows
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}

	chapters := make([]models.Chapter, 0)
	newChapters := make([]models.Chapter, 0)

	chapterSlug := strings.ReplaceAll(
		toonkorID,
		"-",
		"_",
	)

	for index, row := range rows {

		contentTitle := row.Find(
			"td.content__title",
		)

		uploadedDate := strings.TrimSpace(
			row.Find("td.episode__index").Text(),
		)

		chapterID, _ := contentTitle.
			Attr("data-role")

		if chapterID == "" {

			chapterID = fmt.Sprintf(
				"%s_%d화.html",
				chapterSlug,
				index,
			)
		}

		chapterID = strings.TrimPrefix(chapterID, "/")

		chapter := models.Chapter{
			Index:      index,
			ToonkorID:  chapterID,
			UploadedDate: uploadedDate,
		}

		// merge cached chapter
		if cached, exists := chaptersDB[index]; exists {

			if cached.ToonkorID != "" {
				chapter.ToonkorID = cached.ToonkorID
			}

			if cached.UploadedDate != "" {
				chapter.UploadedDate = cached.UploadedDate
			}
			chapter.DownloadStatus = cached.DownloadStatus
			chapter.TranslationStatus = cached.TranslationStatus

		} else {

			newChapters = append(
				newChapters,
				chapter,
			)
		}

		chapters = append(
			chapters,
			chapter,
		)
	}

	manhwa.Chapters = chapters

	return manhwa, newChapters, nil
}

var pageRegex = regexp.MustCompile(`src="([^"]*)"`)

func (t *toonkorClient) GetPageList(
	chapterID string,
) ([]Page, error) {

	chapterURL := t.baseURL + "/" + chapterID

	resp, err := t.doRequest(context.Background(), http.MethodGet, chapterURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	html := string(body)

	re := regexp.MustCompile(`toon_img\s*=\s*'(.*?)'`)
	matches := re.FindStringSubmatch(html)

	if len(matches) < 2 {
		return nil, errors.New("toon_img script not found")
	}

	decoded, err := base64.StdEncoding.DecodeString(matches[1])
	if err != nil {
		return nil, err
	}

	urls := pageRegex.FindAllStringSubmatch(string(decoded), -1)

	pages := make([]Page, 0)

	for i, match := range urls {
		pageURL := match[1]

		if !strings.HasPrefix(pageURL, "http") {
			pageURL = t.baseURL + "/" + pageURL
		}

		pages = append(pages, Page{
			Index: i,
			URL:   pageURL,
		})
	}

	return pages, nil
}

func (t *toonkorClient) UpdateMangadexSearch(
	manga models.Manhwa,
) (*models.Manhwa, error) {

	filters := map[string]string{
		"type": "/단행본",
		"sort": "?fil=최신",
	}

	searchURL := t.SearchMangaRequest(
		1,
		manga.Title,
		filters,
	)

	resp, err := t.doRequest(
		context.Background(),
		http.MethodGet,
		searchURL,
	)

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf(
			"unexpected status: %d",
			resp.StatusCode,
		)
	}

	doc, err := goquery.NewDocumentFromReader(
		resp.Body,
	)

	if err != nil {
		return nil, err
	}

	var updated *models.Manhwa

	doc.Find(
		t.SearchMangaSelector(),
	).EachWithBreak(func(i int, s *goquery.Selection) bool {

		result, err := t.parseMangaElement(s)

		if err != nil {
			return true
		}

		manga.ToonkorID = result.ToonkorID
		manga.Thumbnail = result.Thumbnail

		updated = &manga

		return false
	})

	return updated, nil
}

func (t *toonkorClient) MultiUpdateMangadexSearch(
	mangaResults []models.Manhwa,
) ([]models.Manhwa, error) {

	var wg sync.WaitGroup
	var mu sync.Mutex

	output := make([]models.Manhwa, 0)

	errorChan := make(chan error, len(mangaResults))

	for _, manga := range mangaResults {

		wg.Add(1)

		go func(m models.Manhwa) {

			defer wg.Done()

			updated, err := t.UpdateMangadexSearch(m)

			if err != nil {
				errorChan <- err
				return
			}

			if updated == nil {
				return
			}

			mu.Lock()
			output = append(output, *updated)
			mu.Unlock()

		}(manga)
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

func (t *toonkorClient) SearchMangaRequest(
	page int,
	query string,
	filters map[string]string,
) string {

	typeFilter := filters["type"]
	sortFilter := filters["sort"]

	var requestPath string

	if query != "" {

		requestPath = fmt.Sprintf(
			"/bbs/search.php?sfl=wr_subject%%7C%%7Cwr_content&stx=%s",
			url.QueryEscape(query),
		)

	} else {

		requestPath = typeFilter + sortFilter
	}

	return t.baseURL + "/" + requestPath
}

func (t *toonkorClient) SearchMangaSelector() string {
	return "div.section-item-inner"
}

func (t *toonkorClient) DownloadThumbnail(
	manhwa *models.Manhwa,
	imgURL string,
) (string, error) {

	err := os.MkdirAll(manhwa.Path(), os.ModePerm)
	if err != nil {
		return "", err
	}

	ext := filepath.Ext(imgURL)

	filePath := filepath.Join(
		manhwa.Path(),
		"thumbnail"+ext,
	)

	resp, err := http.Get(imgURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	file, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		return "", err
	}

	return filepath.Base(manhwa.Path()) + "/thumbnail" + ext, nil
}

func (t *toonkorClient) DownloadPage(
	manhwaPath string,
	chapterIndex int,
	pageIndex int,
	pageURL string,
) (string, error) {

	resp, err := t.doRequest(
		context.Background(),
		http.MethodGet,
		pageURL,
	)

	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	ext := filepath.Ext(pageURL)

	dir := filepath.Join(
		manhwaPath,
		fmt.Sprintf("%d", chapterIndex),
	)

	err = os.MkdirAll(dir, os.ModePerm)
	if err != nil {
		return "", err
	}

	filePath := filepath.Join(
		dir,
		fmt.Sprintf("%d%s", pageIndex, ext),
	)

	if _, err := os.Stat(filePath); err == nil {
		return filePath, nil
	}

	file, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		return "", err
	}

	return filePath, nil
}

func (t *toonkorClient) DownloadChapter(
	chapter *models.Chapter,
) ([]string, error) {

	pages, err := t.GetPageList(chapter.ToonkorID)
	if err != nil {
		return nil, err
	}

	var wg sync.WaitGroup
	var mu sync.Mutex

	results := make([]string, 0)
	errorsChan := make(chan error, len(pages))

	for _, page := range pages {
		wg.Add(1)

		go func(p Page) {
			defer wg.Done()

			path, err := t.DownloadPage(
				chapter.Manhwa.Path(),
				chapter.Index,
				p.Index,
				p.URL,
			)

			if err != nil {
				errorsChan <- err
				return
			}

			mu.Lock()
			results = append(results, path)
			mu.Unlock()

		}(page)
	}

	wg.Wait()
	close(errorsChan)

	for err := range errorsChan {
		if err != nil {
			return nil, err
		}
	}

	return results, nil
}

func (t *toonkorClient) SaveManhwa(
	manga *models.Manhwa,
) error {

	manhwa := models.Manhwa{
		Title:       manga.Title,
		Author:      manga.Author,
		Description: manga.Description,
		Thumbnail:   manga.Thumbnail,
		ToonkorID:   manga.ToonkorID,
	}

	return database.DB.Save(&manhwa).Error
}

func extractBaseURL(rawURL string) (string, error) {

	parsed, err := url.Parse(rawURL)

	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"%s://%s",
		parsed.Scheme,
		parsed.Host,
	), nil
}

func (t *toonkorClient) TestCurlCommand(
	curlCommand string,
) bool {

	ctx, err := utils.ParseCurlCommand(
		curlCommand,
	)

	if err != nil {
		return false
	}

	baseURL, err := extractBaseURL(
		ctx.URL,
	)

	if err != nil {
		return false
	}

	headers := maps.Clone(
		ctx.Headers,
	)

	delete(headers, "Accept-Encoding")

	req, err := http.NewRequest(
		http.MethodGet,
		baseURL,
		nil,
	)

	if err != nil {
		return false
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	for _, cookie := range ctx.Cookies {
		req.AddCookie(cookie)
	}

	resp, err := t.client.Do(req)

	if err != nil {
		return false
	}

	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

func (t *toonkorClient) SetCurlCommand(
	curlCommand string,
) error {

	ctx, err := utils.ParseCurlCommand(
		curlCommand,
	)

	if err != nil {
		return err
	}

	baseURL, err := extractBaseURL(
		ctx.URL,
	)

	if err != nil {
		return err
	}

	delete(ctx.Headers, "Accept-Encoding")

	t.baseURL = baseURL
	t.headers = ctx.Headers
	t.cookies = ctx.Cookies

	return nil
}

var ToonkorClient = newToonkorClient()