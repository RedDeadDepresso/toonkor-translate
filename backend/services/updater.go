package services

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const githubRepo = "RedDeadDepresso/toonkor-translate"

// Version is set at build time via -ldflags.
var Version = "dev"

type Release struct {
	TagName string  `json:"tag_name"`
	Assets  []Asset `json:"assets"`
	Body    string  `json:"body"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type UpdateInfo struct {
	Available      bool   `json:"available"`
	CurrentVersion string `json:"currentVersion"`
	NewVersion     string `json:"newVersion"`
	ReleaseNotes   string `json:"releaseNotes"`
}

// CheckForUpdate fetches the latest release from GitHub and returns update info.
func CheckForUpdate() (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "toonkor-translate")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("updater: failed to reach GitHub: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return &UpdateInfo{Available: false, CurrentVersion: Version}, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("updater: GitHub returned %d", resp.StatusCode)
	}

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("updater: decode response: %w", err)
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	current := strings.TrimPrefix(Version, "v")

	return &UpdateInfo{
		Available:      latest != current && current != "dev",
		CurrentVersion: Version,
		NewVersion:     release.TagName,
		ReleaseNotes:   release.Body,
	}, nil
}

// DownloadAndInstallUpdate downloads the NSIS installer from the latest release,
// launches it silently, and quits the application so the installer can replace the exe.
// The quit callback should call app.Quit().
func DownloadAndInstallUpdate(onProgress func(percent int), quit func()) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "toonkor-translate")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return err
	}

	// Find the installer asset.
	var installerURL string
	for _, asset := range release.Assets {
		if strings.HasSuffix(asset.Name, "-installer.exe") {
			installerURL = asset.BrowserDownloadURL
			break
		}
	}
	if installerURL == "" {
		return fmt.Errorf("updater: no installer found in release %s", release.TagName)
	}

	// Download the installer.
	log.Printf("updater: downloading %s", installerURL)
	dlResp, err := http.Get(installerURL)
	if err != nil {
		return fmt.Errorf("updater: download failed: %w", err)
	}
	defer dlResp.Body.Close()

	tmpDir := os.TempDir()
	installerPath := filepath.Join(tmpDir, "toonkor-translate-installer.exe")
	out, err := os.Create(installerPath)
	if err != nil {
		return fmt.Errorf("updater: create temp file: %w", err)
	}

	total := dlResp.ContentLength
	downloaded := int64(0)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := dlResp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := out.Write(buf[:n]); writeErr != nil {
				out.Close()
				return fmt.Errorf("updater: write: %w", writeErr)
			}
			downloaded += int64(n)
			if total > 0 && onProgress != nil {
				onProgress(int(downloaded * 100 / total))
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			out.Close()
			return fmt.Errorf("updater: read: %w", readErr)
		}
	}
	out.Close()

	log.Printf("updater: launching installer %s", installerPath)

	// Launch the installer. /S = silent install.
	cmd := exec.Command(installerPath, "/S")
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("updater: launch installer: %w", err)
	}

	// Quit so the installer can replace the running exe.
	quit()
	return nil
}