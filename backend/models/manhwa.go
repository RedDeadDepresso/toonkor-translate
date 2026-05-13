package models

import (
	"encoding/base64"
	"fmt"
	"path/filepath"
	"time"
	"toonkor-translate/backend/utils"

)

func EncodeName(name string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(name))
}

func DecodeName(encodedName string) (string, error) {
	data, err := base64.RawURLEncoding.DecodeString(encodedName)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

type Manhwa struct {
	ID uint `gorm:"primarykey" json:"id"`

	Title string `json:"title"`
	Description string `json:"description"`

	EnTitle string `json:"enTitle"`
	EnDescription string `json:"enDescription"`

	Author string `json:"author"`
	Thumbnail string `json:"thumbnail"`

	MangaDexID string `json:"mangaDexId"`
	ToonkorID string `gorm:"unique;not null" json:"toonkorId"`

	InLibrary bool `json:"inLibrary"`

	Chapters []Chapter `json:"chapters"`

	UpdatedAt time.Time `json:"updatedAt"`
}

func (manhwa *Manhwa) EncodedName() string {
	return EncodeName(manhwa.ToonkorID)
} 

func (manhwa *Manhwa) Path() string {
	return filepath.Join(utils.AppPath, "media", manhwa.EncodedName())	
}

func (manhwa *Manhwa) MediaPath() string {
    return fmt.Sprintf("/media/%s", manhwa.EncodedName())
}
