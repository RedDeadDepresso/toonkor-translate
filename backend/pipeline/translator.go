package pipeline

import "github.com/wailsapp/wails/v3/pkg/application"

type translator struct {
	isRunning    bool
	eventManager *application.EventManager
}

func (t *translator) Start() {
	if !t.isRunning {
		go t.translateChapters()
		t.isRunning = true
	}
}

func (t *translator) SetEventManager(eventManager *application.EventManager) {
	t.eventManager = eventManager
}

func (t *translator) translateChapters() {
	t.isRunning = false
}

var Translator translator = translator{}