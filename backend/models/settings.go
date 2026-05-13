package models

import (
	"fmt"
	"os"
	"path/filepath"
	"toonkor-translate/backend/database"
)

type Settings struct {
	ID                   uint   `gorm:"primarykey" json:"id"`
	Name                 string `json:"name"`
	CurlCommand          string `json:"curlCommand"`
	TranslationPageLimit uint   `json:"translationPageLimit"`
	ToonkorURL           string `json:"toonkorUrl"`
	KoharuPath           string `json:"koharuPath"`
	// LLM settings: "local" or "provider"
	LLMKind       string `json:"llmKind"`
	// For kind="local": the local model id (e.g. "gguf:llama-...")
	// For kind="provider": the model id within the provider (e.g. "gpt-4o")
	LLMModelID    string `json:"llmModelId"`
	// For kind="provider": the provider id (e.g. "openai", "gemini", "claude")
	LLMProviderID string `json:"llmProviderId"`
	// API key for the chosen provider (stored in DB for simplicity)
	LLMApiKey     string `json:"llmApiKey"`
}

func koharuDefaultPath() string {
	dir, err := os.UserCacheDir()
	if err != nil {
		fmt.Println("Error:", err)
		return ""
	}

	return filepath.Join(dir, "koharu")
}

func MainSettings() *Settings {
	var settings Settings
	
	// Define the default curl command using backticks
	defaultCurl := `curl 'https://tkor116.com/%EC%9B%B9%ED%88%B0' \
  --compressed \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0' \`

	database.DB.Where(Settings{Name: "main"}).
		Attrs(Settings{
			CurlCommand:          defaultCurl,
			TranslationPageLimit: 15,
			ToonkorURL: "https://tkor116.com",
			KoharuPath: koharuDefaultPath(),
			LLMKind:    "provider",
			LLMProviderID: "openai",
			LLMModelID: "gpt-4o-mini",
		}).
		FirstOrCreate(&settings)

	return &settings
}