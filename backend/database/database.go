package database

import (
	"log"
	"path/filepath"
	"toonkor-translate/backend/utils"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init(models ...interface{}) {
    var err error
    DB, err = gorm.Open(sqlite.Open(filepath.Join(utils.AppPath, "local.db")), &gorm.Config{})
    
    if err != nil {
        log.Fatal("Failed to connect to database:", err)
    }

    log.Println("Database connection established")

    if len(models) > 0 {
        if err := DB.AutoMigrate(models...); err != nil {
            log.Fatal("Failed to auto-migrate database:", err)
        }
        log.Println("Database migrated")
    }
}