package utils

import (
	"fmt"
	"os"
	"path/filepath"
)


func getAppPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		fmt.Println("could not determine config directory: %w", err)
		os.Exit(1)
	}

	appPath := filepath.Join(configDir, "ToonkorTranslate")
	if err = os.MkdirAll(appPath, 0700); err != nil {
		fmt.Println("error creating app folder: %w", err)
		os.Exit(1)
	}

	return appPath
}

var AppPath = getAppPath()
