package models

import (
	"database/sql/driver"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
	"toonkor-translate/backend/utils"
	"unicode"
)

type Status int

const (
	NotReady Status = iota
	Loading
	Ready
	Removing
)

func (s Status) Value() (driver.Value, error) {
	return int64(s), nil
}

func (s *Status) Scan(value interface{}) error {
	if value == nil {
		*s = NotReady
		return nil
	}
	if iv, ok := value.(int64); ok {
		*s = Status(iv)
		return nil
	}
	return fmt.Errorf("failed to scan Status: %v", value)
}

type Chapter struct {
	ID        uint  `gorm:"primarykey" json:"id"`
	Index     int `json:"index"`
	ToonkorID string `json:"toonkorId"`
	ManhwaID  uint   `gorm:"index" json:"manhwaId"`
	Manhwa    Manhwa `gorm:"foreignKey:ManhwaID" json:"manhwa"`

	DownloadStatus    Status `gorm:"type:integer;index" json:"downloadStatus"`
	TranslationStatus Status `gorm:"type:integer;index" json:"translationStatus"`

	UploadedDate string `json:"uploadedDate"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// --- Path Helpers ---

// DownloadPath is the physical path on disk
func (chapter *Chapter) DownloadPath() string {
	return filepath.Join(chapter.Manhwa.Path(), fmt.Sprintf("%d", chapter.Index))
}

// TranslationPath is the physical path on disk for translated images
func (chapter *Chapter) TranslationPath() string {
	return filepath.Join(chapter.DownloadPath(), "translated")
}

// MediaDownloadPath is the URL path for the frontend
func (chapter *Chapter) MediaDownloadPath() string {
	return fmt.Sprintf("%s/%d", chapter.Manhwa.MediaPath(), chapter.Index)
}

// MediaTranslationPath is the URL path for the frontend
func (chapter *Chapter) MediaTranslationPath() string {
	return fmt.Sprintf("%s/translated", chapter.MediaDownloadPath())
}

// --- Logic Helpers ---

func IsDigit(s string) bool {
	if s == "" { return false }
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

var ImageExtensions = utils.StringSet{
	".png":  {},
	".jpeg": {},
	".jpg":  {},
	".webp": {},
	".gif":  {},
	".svg":  {},
}

func isPage(file string) bool {
	ext := strings.ToLower(filepath.Ext(file))
	root := strings.TrimSuffix(file, filepath.Ext(file))
	return IsDigit(root) && ImageExtensions.Has(ext)
}

func getFileNumericValue(path string) int {
	// Get "10.jpg" from "path/to/10.jpg"
	base := filepath.Base(path)
	// Remove extension to get "10"
	nameOnly := strings.TrimSuffix(base, filepath.Ext(base))
	
	val, err := strconv.Atoi(nameOnly)
	if err != nil {
		// If it's not a number, treat it as 0 or handle as needed
		return 0
	}
	return val
}

// pages scans the physical disk and returns full physical paths sorted numerically
func pages(pagesPath string) []string {
	var pages []string

	files, err := os.ReadDir(pagesPath)
	if err != nil {
		log.Printf("Error reading directory %s: %v", pagesPath, err)
		return pages
	}

	for _, file := range files {
		if !file.IsDir() && isPage(file.Name()) {
			pages = append(pages, filepath.Join(pagesPath, file.Name()))
		}
	}

	// Sort numerically based on the filename integer
	slices.SortFunc(pages, func(a, b string) int {
		return getFileNumericValue(a) - getFileNumericValue(b)
	})

	return pages
}

// mediaPages scans physical disk and returns URL paths sorted numerically
func mediaPages(physicalPath string, mediaPrefix string) []string {
	var pages []string

	files, err := os.ReadDir(physicalPath)
	if err != nil {
		log.Printf("Error reading directory %s: %v", physicalPath, err)
		return pages
	}

	for _, file := range files {
		if !file.IsDir() && isPage(file.Name()) {
			pages = append(pages, fmt.Sprintf("%s/%s", mediaPrefix, file.Name()))
		}
	}

	// Sort numerically based on the filename integer
	slices.SortFunc(pages, func(a, b string) int {
		return getFileNumericValue(a) - getFileNumericValue(b)
	})

	return pages
}
// --- Receiver Methods ---

func (chapter *Chapter) DownloadPages() []string {
	return pages(chapter.DownloadPath())
}

func (chapter *Chapter) TranslationPages() []string {
	return pages(chapter.TranslationPath())
}

func (chapter *Chapter) MediaDownloadPages() []string {
	return mediaPages(chapter.DownloadPath(), chapter.MediaDownloadPath())
}

func (chapter *Chapter) MediaTranslationPages() []string {
	return mediaPages(chapter.TranslationPath(), chapter.MediaTranslationPath())
}

func (chapter *Chapter) DeleteDownload() {
	os.RemoveAll(chapter.DownloadPath())
}

func (chapter *Chapter) DeleteTranslation() {
	os.RemoveAll(chapter.TranslationPath())
}

type ChapterDetails struct {
	ManhwaID string `json:"manhwaID"`
	ManhwaTitle string `json:"manhwaTitle"`
	ManhwaEnTitle string `json:"manhwaEnTitle"`
	PrevChapter *Chapter `json:"prevChapter"`
	CurrentChapter *Chapter `json:"currentChapter"`
	NextChapter *Chapter `json:"nextChapter"`
	Pages []string `json:"pages"`
}

type ChapterChoice string

const (
	Downloaded = "downloaded"
	Translated = "translated"
)