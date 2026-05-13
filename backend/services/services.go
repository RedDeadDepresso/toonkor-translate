package services

import (
	"errors"
	"fmt"
	"log"
	"net/url"
	"regexp"
	"time"
	"toonkor-translate/backend/database"
	"toonkor-translate/backend/models"

	"gorm.io/gorm"
)

var startTime = time.Now()

func GetStartTime() time.Time {
	return startTime
}

func ResetStartTime() {
	startTime = time.Now()
}

func IsValidURL(rawURL string) bool {
	_, err := url.ParseRequestURI(rawURL)
	return err == nil
}

func ExtractMangadexURL(rawURL string) string {
	pattern := `^https?://(www\.)?mangadex\.org/title/([a-f0-9-]+)/?.*$`

	re := regexp.MustCompile(pattern)

	match := re.FindStringSubmatch(rawURL)

	if len(match) < 3 {
		return ""
	}

	return match[2]
}

func ExtractToonkorURL(rawURL string) string {
	pattern := `^https?://tkor\d+\.com(/[\w%\-가-힣/]+).*$`

	re := regexp.MustCompile(pattern)

	match := re.FindStringSubmatch(rawURL)

	if len(match) < 2 {
		return ""
	}

	return match[1]
}

func  GetDBChaptersMap(
	manhwa *models.Manhwa,
) map[int]models.Chapter {

	output := make(map[int]models.Chapter)

	for _, chapter := range manhwa.Chapters {

		output[chapter.Index] = models.Chapter{
			Index:      chapter.Index,
			ToonkorID:  chapter.ToonkorID,
			UploadedDate: chapter.UploadedDate,
		}
	}

	return output
}

func  UpdateManhwaFromMangadex(
	manhwa *models.Manhwa,
	manhwaDB *models.Manhwa,
) error {

	results, err := MangaDexClient.Search(manhwa.Title)
	if err != nil {
		return err
	}

	if len(results) == 0 {
		return nil
	}

	manga := results[0]

	manhwa.EnTitle = manga.EnTitle
	manhwa.EnDescription = manga.EnDescription
	manhwa.MangaDexID = manga.MangaDexID

	if manhwaDB != nil {

		manhwaDB.EnTitle = manga.EnTitle
		manhwaDB.EnDescription = manga.EnDescription
		manhwaDB.MangaDexID = manga.MangaDexID

		return database.DB.Save(manhwaDB).Error
	}

	return nil
}

func  GetManhwaDetails(
	toonkorID string,
) (*models.Manhwa, error) {

	manhwa := &models.Manhwa{
		Chapters: []models.Chapter{},
	}

	var manhwaDB models.Manhwa

	err := database.DB.
		Preload("Chapters", func(db *gorm.DB) *gorm.DB {
			return db.Order("`index` ASC")		
		}).
		Where("toonkor_id = ?", toonkorID).
		First(&manhwaDB).Error

	existsInDB := err == nil

	if existsInDB {

		manhwa.Title = manhwaDB.Title
		manhwa.EnTitle = manhwaDB.EnTitle
		manhwa.Author = manhwaDB.Author
		manhwa.Description = manhwaDB.Description
		manhwa.EnDescription = manhwaDB.EnDescription
		manhwa.Thumbnail = manhwaDB.Thumbnail
		manhwa.ToonkorID = manhwaDB.ToonkorID
		manhwa.MangaDexID = manhwaDB.MangaDexID
		manhwa.InLibrary = manhwaDB.InLibrary

		if manhwaDB.UpdatedAt.After(GetStartTime()) {
			manhwa.Chapters = manhwaDB.Chapters
			return manhwa, nil
		}
	}

	chaptersMap := GetDBChaptersMap(&manhwaDB)

	toonkorDetails, newChapters, err :=
		ToonkorClient.GetManhwaDetails(
			toonkorID, chaptersMap)

	if err != nil {
		return nil, err
	}

	manhwa.Title = toonkorDetails.Title
	manhwa.Author = toonkorDetails.Author
	manhwa.Description = toonkorDetails.Description
	manhwa.Thumbnail = toonkorDetails.Thumbnail
	manhwa.ToonkorID = toonkorDetails.ToonkorID
	manhwa.Chapters = toonkorDetails.Chapters

	if manhwa.EnTitle == "" ||
		manhwa.EnDescription == "" ||
		manhwa.MangaDexID == "" {

		var dbPtr *models.Manhwa

		if existsInDB {
			dbPtr = &manhwaDB
		}

		_ = UpdateManhwaFromMangadex(
			manhwa,
			dbPtr,
		)
	}

	if existsInDB {

		manhwaDB.UpdatedAt = time.Now()

		_ = database.DB.Save(&manhwaDB).Error

		if len(newChapters) > 0 {

			chapters := make([]models.Chapter, 0)

			for _, chapter := range newChapters {

				chapters = append(chapters, models.Chapter{
					ManhwaID:   manhwaDB.ID,
					Index:      chapter.Index,
					ToonkorID:  chapter.ToonkorID,
					UploadedDate: chapter.UploadedDate,
				})
			}

			_ = database.DB.Create(&chapters).Error
		}

		manhwa.Thumbnail = manhwaDB.Thumbnail
	}

	return manhwa, nil
}

func  AddManhwaToLibrary(
	toonkorID string,
) (bool, *models.Manhwa, error) {

	manhwaDetails, err := GetManhwaDetails(toonkorID)

	if err != nil {
		return false, nil, err
	}

	var existing models.Manhwa

	err = database.DB.
		Where("toonkor_id = ?", toonkorID).
		First(&existing).Error

	if err == nil {
		if (!existing.InLibrary) {
			database.DB.Model(&existing).Update("in_library", true)
		}
		return true, &existing, nil
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil, err
	}

	manhwa := &models.Manhwa{
		Title:         manhwaDetails.Title,
		EnTitle:       manhwaDetails.EnTitle,
		Author:        manhwaDetails.Author,
		Description:   manhwaDetails.Description,
		EnDescription: manhwaDetails.EnDescription,
		Thumbnail:     manhwaDetails.Thumbnail,
		ToonkorID:     manhwaDetails.ToonkorID,
		MangaDexID:    manhwaDetails.MangaDexID,
		InLibrary:     true,
	}

	if err := database.DB.Create(manhwa).Error; err != nil {
		return false, nil, err
	}

	thumbnailPath, err := ToonkorClient.DownloadThumbnail(
		manhwa,
		manhwa.Thumbnail,
	)
	thumbnailMedia := fmt.Sprintf("/media/%s", thumbnailPath)

	if err == nil && thumbnailPath != "" {

		manhwa.Thumbnail = thumbnailMedia

		_ = database.DB.Save(manhwa).Error
	}

	chapters := make([]models.Chapter, 0)

	for _, chapter := range manhwaDetails.Chapters {

		chapters = append(chapters, models.Chapter{
			ManhwaID:   manhwa.ID,
			Index:      chapter.Index,
			ToonkorID:  chapter.ToonkorID,
			UploadedDate: chapter.UploadedDate,
		})
	}

	if len(chapters) > 0 {
		_ = database.DB.Create(&chapters).Error
	}

	return true, manhwa, nil
}

func RemoveManhwaFromLibrary(toonkorID string) bool {
    var manhwa models.Manhwa

    // 1. Find the Manhwa record first
    // We need the ID to check for related chapters
    err := database.DB.Where("toonkor_id = ?", toonkorID).First(&manhwa).Error
    if err != nil {
        return false
    }

    // 2. Check if any chapters exist with content (Status != NotReady)
    // We use a subquery with Exists for maximum performance
    var hasContent bool
    err = database.DB.Model(&models.Chapter{}).
        Select("count(1) > 0").
        Where("manhwa_id = ?", manhwa.ID).
        Where("download_status != ? OR translation_status != ?", models.NotReady, models.NotReady).
        Limit(1).
        Row().
        Scan(&hasContent)

    if err != nil {
        // If the query fails for some reason, default to safe behavior
        log.Printf("Database error checking chapter content: %v", err)
        return false
    }

    // 3. Perform the appropriate removal logic
    if hasContent {
        // The user has files on disk; just hide the manhwa from the library view
        if err := database.DB.Model(&manhwa).Update("in_library", false).Error; err != nil {
            return false
        }
    } else {
        // No files exist; we can safely delete the manhwa record entirely
        // This will also delete the associated Chapter rows if you have
        // foreign key constraints set to ON DELETE CASCADE
        if err := database.DB.Delete(&manhwa).Error; err != nil {
            return false
        }
    }

    return true
}

func ChapterFromIndex(
	manhwa *models.Manhwa,
	index int,
) *models.Chapter {

	if index < 0 {
		return nil
	}

	if index >= len(manhwa.Chapters) {
		return nil
	}

	return &manhwa.Chapters[index]
}