package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
)

type Bookmark struct {
	Name         string `json:"name"`
	URL          string `json:"url"`
	PageID       int    `json:"pageId,omitempty"`
	Shortcut     string `json:"shortcut"`
	Category     string `json:"category"`
	Pinned       bool   `json:"pinned,omitempty"`
	CheckStatus  bool   `json:"checkStatus"`
	Icon         string `json:"icon"`
	LastOpened   int64  `json:"lastOpened,omitempty"`
	LastChecked  int64  `json:"lastChecked,omitempty"`
	LastError    string `json:"lastError,omitempty"`
	OpenCount    int    `json:"openCount,omitempty"`    // Analytics: track opens
	PreviewTitle string `json:"previewTitle,omitempty"` // Preview metadata
	PreviewDesc  string `json:"previewDesc,omitempty"`  // Preview description
	PreviewImage string `json:"previewImage,omitempty"` // Preview image URL
}

type Finder struct {
	Name      string `json:"name"`
	SearchUrl string `json:"searchUrl"`
	Shortcut  string `json:"shortcut"`
}

type Category struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	OriginalID string `json:"originalId,omitempty"` // Track original ID for renames
	Icon       string `json:"icon,omitempty"`       // Custom icon for category
}

type Page struct {
	ID   int    `json:"id"`   // Numeric ID matching the file number (bookmarks-1.json = id: 1)
	Name string `json:"name"` // Editable page name
}

type PageWithBookmarks struct {
	Page       Page       `json:"page"`
	Categories []Category `json:"categories,omitempty"`
	Bookmarks  []Bookmark `json:"bookmarks"`
}

type PageOrder struct {
	Order []int `json:"order"` // Array of page IDs in display order
}

type Settings struct {
	CurrentPage               int     `json:"currentPage"` // Numeric ID of the current page
	Theme                     string  `json:"theme"`       // "light" or "dark"
	OpenInNewTab              bool    `json:"openInNewTab"`
	ColumnsPerRow             int     `json:"columnsPerRow"`
	FontSize                  string  `json:"fontSize"` // "small", "medium", or "large"
	ShowBackgroundDots        bool    `json:"showBackgroundDots"`
	ShowTitle                 bool    `json:"showTitle"`
	ShowDate                  bool    `json:"showDate"`
	ShowConfigButton          bool    `json:"showConfigButton"`
	ShowSearchButton          bool    `json:"showSearchButton"`
	ShowFindersButton         bool    `json:"showFindersButton"`
	ShowCommandsButton        bool    `json:"showCommandsButton"`
	ShowCheatSheetButton      bool    `json:"showCheatSheetButton"`
	ShowSearchButtonText      bool    `json:"showSearchButtonText"`
	ShowFindersButtonText     bool    `json:"showFindersButtonText"`
	ShowCommandsButtonText    bool    `json:"showCommandsButtonText"`
	ShowStatus                bool    `json:"showStatus"`
	ShowPing                  bool    `json:"showPing"`
	ShowStatusLoading         bool    `json:"showStatusLoading"`
	SkipFastPing              bool    `json:"skipFastPing"`
	GlobalShortcuts           bool    `json:"globalShortcuts"`           // Use shortcuts from all pages
	HyprMode                  bool    `json:"hyprMode"`                  // Launcher mode for PWA usage
	AnimationsEnabled         bool    `json:"animationsEnabled"`         // Enable or disable animations globally
	EnableCustomTitle         bool    `json:"enableCustomTitle"`         // Enable custom page title
	CustomTitle               string  `json:"customTitle"`               // Custom page title
	ShowPageInTitle           bool    `json:"showPageInTitle"`           // Show current page name in title
	ShowPageNamesInTabs       bool    `json:"showPageNamesInTabs"`       // Show page names in tabs instead of numbers
	EnableCustomFavicon       bool    `json:"enableCustomFavicon"`       // Enable custom favicon
	CustomFaviconPath         string  `json:"customFaviconPath"`         // Path to custom favicon file
	EnableCustomFont          bool    `json:"enableCustomFont"`          // Enable custom font
	CustomFontPath            string  `json:"customFontPath"`            // Path to custom font file
	Language                  string  `json:"language"`                  // Language code, e.g., "en" or "es"
	InterleaveMode            bool    `json:"interleaveMode"`            // Interleave mode for search (/ for shortcuts, direct input for fuzzy)
	ShowPageTabs              bool    `json:"showPageTabs"`              // Show page navigation tabs
	AlwaysCollapseCategories  bool    `json:"alwaysCollapseCategories"`  // Always collapse categories on load
	EnableFuzzySuggestions    bool    `json:"enableFuzzySuggestions"`    // Enable fuzzy suggestions in shortcut search
	FuzzySuggestionsStartWith bool    `json:"fuzzySuggestionsStartWith"` // Fuzzy suggestions start with query instead of contains
	KeepSearchOpenWhenEmpty   bool    `json:"keepSearchOpenWhenEmpty"`   // Keep search interface open when query is empty
	ShowIcons                 bool    `json:"showIcons"`                 // Show bookmark icons
	IncludeFindersInSearch    bool    `json:"includeFindersInSearch"`    // Include finders in normal search
	SortMethod                string  `json:"sortMethod"`                // Sort method for bookmarks: order, az, recent, custom
	LayoutPreset              string  `json:"layoutPreset"`              // Dashboard layout preset
	BackgroundOpacity         float64 `json:"backgroundOpacity"`         // Background opacity (0.0-1.0)
	FontWeight                string  `json:"fontWeight"`                // Font weight: normal, 600, bold
	AutoDarkMode              bool    `json:"autoDarkMode"`              // Auto-detect dark mode from system
	ShowSmartRecentCollection bool    `json:"showSmartRecentCollection"` // Show smart recently opened collection
	ShowSmartStaleCollection  bool    `json:"showSmartStaleCollection"`  // Show smart stale bookmarks collection
	SmartRecentPageIds        []int   `json:"smartRecentPageIds"`        // Page IDs where smart recent is enabled (empty = all)
	SmartStalePageIds         []int   `json:"smartStalePageIds"`         // Page IDs where smart stale is enabled (empty = all)
	SearchIndexed             bool    `json:"searchIndexed"`             // Is search index built
}

type ColorTheme struct {
	Light  ThemeColors            `json:"light"`
	Dark   ThemeColors            `json:"dark"`
	Custom map[string]ThemeColors `json:"custom"` // Custom themes with dynamic keys
}

type ThemeColors struct {
	Name                string `json:"name,omitempty"` // Optional name for custom themes
	TextPrimary         string `json:"textPrimary"`
	TextSecondary       string `json:"textSecondary"`
	TextTertiary        string `json:"textTertiary"`
	BackgroundPrimary   string `json:"backgroundPrimary"`
	BackgroundSecondary string `json:"backgroundSecondary"`
	BackgroundDots      string `json:"backgroundDots"`
	BackgroundModal     string `json:"backgroundModal"`
	BorderPrimary       string `json:"borderPrimary"`
	BorderSecondary     string `json:"borderSecondary"`
	AccentSuccess       string `json:"accentSuccess"`
	AccentWarning       string `json:"accentWarning"`
	AccentError         string `json:"accentError"`
}

type Store interface {
	// Bookmarks - per page only
	GetBookmarksByPage(pageID int) []Bookmark
	GetAllBookmarks() []Bookmark
	SaveBookmarksByPage(pageID int, bookmarks []Bookmark)
	AddBookmarkToPage(pageID int, bookmark Bookmark)
	DeleteBookmarkFromPage(pageID int, bookmark Bookmark) error
	// Categories - per page only
	GetCategoriesByPage(pageID int) []Category
	SaveCategoriesByPage(pageID int, categories []Category)
	// Finders
	GetFinders() []Finder
	SaveFinders(finders []Finder)
	// Pages
	GetPages() []Page
	SavePage(page Page, bookmarks []Bookmark)
	DeletePage(pageID int) error
	GetPageOrder() []int
	SavePageOrder(order []int)
	// Settings
	GetSettings() Settings
	SaveSettings(settings Settings)
	// Colors
	GetColors() ColorTheme
	SaveColors(colors ColorTheme)
}

type FileStore struct {
	settingsFile  string
	colorsFile    string
	pageOrderFile string
	dataDir       string
	mutex         sync.RWMutex
}

func NewStore() Store {
	store := &FileStore{
		settingsFile:  "data/settings.json",
		colorsFile:    "data/colors.json",
		pageOrderFile: "data/pages.json",
		dataDir:       "data",
	}

	// Initialize default files if they don't exist
	store.initializeDefaultFiles()

	return store
}

func (fs *FileStore) initializeDefaultFiles() {
	fs.ensureDataDir()

	// Initialize bookmarks for main page if file doesn't exist
	mainPageBookmarksFile := "data/bookmarks-1.json"
	if _, err := os.Stat(mainPageBookmarksFile); os.IsNotExist(err) {
		defaultPageWithBookmarks := PageWithBookmarks{
			Page: Page{
				ID:   1,
				Name: "main",
			},
			Categories: []Category{
				{ID: "development", Name: "Development"},
				{ID: "media", Name: "Media"},
				{ID: "social", Name: "Social"},
				{ID: "search", Name: "Search"},
				{ID: "utilities", Name: "Utilities"},
			},
			Bookmarks: []Bookmark{
				{Name: "GitHub", URL: "https://github.com", Shortcut: "G", Category: "development", CheckStatus: false},
				{Name: "GitHub Issues", URL: "https://github.com/issues", Shortcut: "GI", Category: "development", CheckStatus: false},
				{Name: "GitHub Pull Requests", URL: "https://github.com/pulls", Shortcut: "GP", Category: "development", CheckStatus: false},
				{Name: "YouTube", URL: "https://youtube.com", Shortcut: "Y", Category: "media", CheckStatus: false},
				{Name: "YouTube Studio", URL: "https://studio.youtube.com", Shortcut: "YS", Category: "media", CheckStatus: false},
				{Name: "Twitter", URL: "https://twitter.com", Shortcut: "T", Category: "social", CheckStatus: false},
				{Name: "TikTok", URL: "https://tiktok.com", Shortcut: "TT", Category: "social", CheckStatus: false},
				{Name: "Google", URL: "https://google.com", Shortcut: "", Category: "search", CheckStatus: false},
			},
		}
		data, _ := json.MarshalIndent(defaultPageWithBookmarks, "", "  ")
		os.WriteFile(mainPageBookmarksFile, data, 0644)
	}

	// Initialize settings if file doesn't exist
	if _, err := os.Stat(fs.settingsFile); os.IsNotExist(err) {
		defaultSettings := Settings{
			CurrentPage:               1,
			Theme:                     "dark",
			OpenInNewTab:              true,
			ColumnsPerRow:             3,
			FontSize:                  "medium",
			ShowBackgroundDots:        true,
			ShowTitle:                 true,
			ShowDate:                  true,
			ShowConfigButton:          true,
			ShowSearchButton:          true,
			ShowFindersButton:         false,
			ShowCommandsButton:        false,
			ShowCheatSheetButton:      true,
			ShowSearchButtonText:      true,
			ShowFindersButtonText:     true,
			ShowCommandsButtonText:    true,
			ShowStatus:                false,
			ShowPing:                  false,
			ShowStatusLoading:         false,
			SkipFastPing:              false,
			GlobalShortcuts:           true,
			HyprMode:                  false,
			AnimationsEnabled:         true,
			EnableCustomTitle:         false,
			CustomTitle:               "",
			ShowPageInTitle:           false,
			ShowPageNamesInTabs:       false,
			EnableCustomFavicon:       false,
			CustomFaviconPath:         "",
			EnableCustomFont:          false,
			CustomFontPath:            "",
			Language:                  "en",
			InterleaveMode:            false,
			ShowPageTabs:              true,
			AlwaysCollapseCategories:  false,
			EnableFuzzySuggestions:    false,
			FuzzySuggestionsStartWith: false,
			KeepSearchOpenWhenEmpty:   false,
			ShowIcons:                 false,
			IncludeFindersInSearch:    false,
			SortMethod:                "order",
			LayoutPreset:              "default",
			BackgroundOpacity:         1,
			FontWeight:                "normal",
			AutoDarkMode:              false,
			ShowSmartRecentCollection: true,
			ShowSmartStaleCollection:  true,
			SmartRecentPageIds:        []int{},
			SmartStalePageIds:         []int{},
		}
		data, _ := json.MarshalIndent(defaultSettings, "", "  ")
		os.WriteFile(fs.settingsFile, data, 0644)
	}

	// Initialize colors if file doesn't exist
	if _, err := os.Stat(fs.colorsFile); os.IsNotExist(err) {
		defaultColors := getDefaultColors()
		data, _ := json.MarshalIndent(defaultColors, "", "  ")
		os.WriteFile(fs.colorsFile, data, 0644)
	}

}

func (fs *FileStore) ensureDataDir() {
	os.MkdirAll("data", 0755)
}

// getDefaultNewPageCategories returns the default categories for a newly created page
func getDefaultNewPageCategories() []Category {
	return []Category{
		{ID: "others", Name: "dashboard.others"},
	}
}

func (fs *FileStore) GetBookmarksByPage(pageID int) []Bookmark {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	fs.ensureDataDir()

	// Read directly from bookmarks-{pageID}.json
	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return []Bookmark{}
	}

	var pageWithBookmarks PageWithBookmarks
	if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
		return []Bookmark{}
	}

	for i := range pageWithBookmarks.Bookmarks {
		pageWithBookmarks.Bookmarks[i].PageID = pageID
	}

	return pageWithBookmarks.Bookmarks
}

func (fs *FileStore) SaveBookmarksByPage(pageID int, bookmarks []Bookmark) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	// Read the existing page data
	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	for i := range bookmarks {
		bookmarks[i].PageID = pageID
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		// If file doesn't exist, create new page with this ID and default categories
		pageWithBookmarks := PageWithBookmarks{
			Page: Page{
				ID:   pageID,
				Name: fmt.Sprintf("Page %d", pageID),
			},
			Categories: getDefaultNewPageCategories(),
			Bookmarks:  bookmarks,
		}
		newData, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
		os.WriteFile(filePath, newData, 0644)
		return
	}

	var pageWithBookmarks PageWithBookmarks
	if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
		return
	}

	// Update only bookmarks, preserve page metadata and categories
	pageWithBookmarks.Bookmarks = bookmarks
	newData, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
	os.WriteFile(filePath, newData, 0644)
}

func (fs *FileStore) AddBookmarkToPage(pageID int, bookmark Bookmark) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	// Read the existing page data
	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	data, err := os.ReadFile(filePath)
	if err != nil {
		// If file doesn't exist, create new page with this ID and default categories
		pageWithBookmarks := PageWithBookmarks{
			Page: Page{
				ID:   pageID,
				Name: fmt.Sprintf("Page %d", pageID),
			},
			Categories: getDefaultNewPageCategories(),
			Bookmarks:  []Bookmark{bookmark},
		}
		newData, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
		os.WriteFile(filePath, newData, 0644)
		return
	}

	var pageWithBookmarks PageWithBookmarks
	if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
		return
	}

	// Add the new bookmark to existing bookmarks
	bookmark.PageID = pageID
	pageWithBookmarks.Bookmarks = append(pageWithBookmarks.Bookmarks, bookmark)
	newData, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
	os.WriteFile(filePath, newData, 0644)
}

func (fs *FileStore) DeleteBookmarkFromPage(pageID int, bookmarkToDelete Bookmark) error {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	// Read the existing page data
	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	var pageWithBookmarks PageWithBookmarks
	if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
		return err
	}

	// Find and remove the bookmark
	originalLength := len(pageWithBookmarks.Bookmarks)
	pageWithBookmarks.Bookmarks = fs.removeBookmarkFromSlice(pageWithBookmarks.Bookmarks, bookmarkToDelete)

	// If no bookmark was removed, return error
	if len(pageWithBookmarks.Bookmarks) == originalLength {
		return fmt.Errorf("bookmark not found")
	}

	// Save the updated data
	newData, err := json.MarshalIndent(pageWithBookmarks, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, newData, 0644)
}

func (fs *FileStore) removeBookmarkFromSlice(bookmarks []Bookmark, toDelete Bookmark) []Bookmark {
	result := make([]Bookmark, 0)
	removed := false
	for _, b := range bookmarks {
		if !removed && b.Name == toDelete.Name && b.URL == toDelete.URL {
			removed = true
			// Skip this bookmark (remove only the first match)
		} else {
			result = append(result, b)
		}
	}
	return result
}

func (fs *FileStore) GetAllBookmarks() []Bookmark {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	fs.ensureDataDir()

	// Get all pages
	pages := fs.GetPages()

	var allBookmarks []Bookmark

	// Collect bookmarks from all pages
	for _, page := range pages {
		pageBookmarks := fs.GetBookmarksByPage(page.ID)
		for i := range pageBookmarks {
			pageBookmarks[i].PageID = page.ID
		}
		allBookmarks = append(allBookmarks, pageBookmarks...)
	}

	return allBookmarks
}

func (fs *FileStore) GetFinders() []Finder {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	fs.ensureDataDir()

	filePath := fmt.Sprintf("%s/finders.json", fs.dataDir)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return []Finder{}
	}

	var finders []Finder
	if err := json.Unmarshal(data, &finders); err != nil {
		return []Finder{}
	}

	return finders
}

func (fs *FileStore) SaveFinders(finders []Finder) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	filePath := fmt.Sprintf("%s/finders.json", fs.dataDir)
	data, err := json.MarshalIndent(finders, "", "  ")
	if err != nil {
		return
	}

	os.WriteFile(filePath, data, 0644)
}

// GetCategoriesByPage returns categories stored inside bookmarks-{pageID}.json if present
func (fs *FileStore) GetCategoriesByPage(pageID int) []Category {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	fs.ensureDataDir()

	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return []Category{}
	}

	var pageWithBookmarks PageWithBookmarks
	if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
		return []Category{}
	}

	return pageWithBookmarks.Categories
}

// SaveCategoriesByPage saves categories inside bookmarks-{pageID}.json, creating the file if needed
// It also updates bookmarks to use the new category IDs when category names change
func (fs *FileStore) SaveCategoriesByPage(pageID int, categories []Category) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	data, err := os.ReadFile(filePath)
	if err != nil {
		// Create new page file with provided categories and empty bookmarks
		// Note: This is called when explicitly saving categories for a page
		pageWithBookmarks := PageWithBookmarks{
			Page: Page{
				ID:   pageID,
				Name: fmt.Sprintf("Page %d", pageID),
			},
			Categories: categories,
			Bookmarks:  []Bookmark{},
		}
		newData, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
		os.WriteFile(filePath, newData, 0644)
		return
	}

	var pageWithBookmarks PageWithBookmarks
	if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
		return
	}

	// Create a mapping from old category IDs to new category IDs
	// This allows us to update bookmarks when category names (and thus IDs) change
	oldToNewCategoryMap := make(map[string]string)

	// Build the mapping using originalId if available, otherwise try to match by position or name
	for i, newCat := range categories {
		// If originalId is set, use it to find the old category
		if newCat.OriginalID != "" {
			oldToNewCategoryMap[newCat.OriginalID] = newCat.ID
			// Also map from current ID to new ID in case they're different
			if newCat.OriginalID != newCat.ID {
				oldToNewCategoryMap[newCat.OriginalID] = newCat.ID
			}
		} else if i < len(pageWithBookmarks.Categories) {
			// Fallback: map by position if originalId is not available
			oldCat := pageWithBookmarks.Categories[i]
			oldToNewCategoryMap[oldCat.ID] = newCat.ID
		}
	}

	// Update bookmarks to use new category IDs
	for i := range pageWithBookmarks.Bookmarks {
		oldCategoryID := pageWithBookmarks.Bookmarks[i].Category
		if newCategoryID, exists := oldToNewCategoryMap[oldCategoryID]; exists {
			pageWithBookmarks.Bookmarks[i].Category = newCategoryID
		}
	}

	pageWithBookmarks.Categories = categories
	newData, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
	os.WriteFile(filePath, newData, 0644)
}

func (fs *FileStore) GetPages() []Page {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	return fs.getPages()
}

func (fs *FileStore) getPages() []Page {
	fs.ensureDataDir()

	var pages []Page

	// Read all bookmarks files in data directory
	files, err := os.ReadDir(fs.dataDir)
	if err != nil {
		return []Page{{ID: 1, Name: "main"}}
	}

	// First, collect all pages from bookmark files
	pageMap := make(map[int]Page)
	for _, file := range files {
		if file.IsDir() || !strings.HasPrefix(file.Name(), "bookmarks-") || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := fmt.Sprintf("%s/%s", fs.dataDir, file.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		var pageWithBookmarks PageWithBookmarks
		if err := json.Unmarshal(data, &pageWithBookmarks); err != nil {
			continue
		}

		pageMap[pageWithBookmarks.Page.ID] = pageWithBookmarks.Page
	}

	if len(pageMap) == 0 {
		return []Page{{ID: 1, Name: "main"}}
	}

	// Get the order from pages.json
	order := fs.getPageOrder()

	// If no order file exists, create default order
	if len(order) == 0 {
		for id := range pageMap {
			order = append(order, id)
		}
		// Save the default order
		fs.savePageOrder(order)
	}

	// Build pages array in the specified order
	for _, id := range order {
		if page, exists := pageMap[id]; exists {
			pages = append(pages, page)
		}
	}

	// Add any pages that exist in files but not in order
	for id, page := range pageMap {
		found := false
		for _, orderId := range order {
			if orderId == id {
				found = true
				break
			}
		}
		if !found {
			pages = append(pages, page)
		}
	}

	return pages
}

func (fs *FileStore) GetPageOrder() []int {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	return fs.getPageOrder()
}

func (fs *FileStore) getPageOrder() []int {
	fs.ensureDataDir()

	data, err := os.ReadFile(fs.pageOrderFile)
	if err != nil {
		return []int{}
	}

	var pageOrder PageOrder
	if err := json.Unmarshal(data, &pageOrder); err != nil {
		return []int{}
	}

	return pageOrder.Order
}

func (fs *FileStore) SavePageOrder(order []int) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.savePageOrder(order)
}

func (fs *FileStore) savePageOrder(order []int) {
	fs.ensureDataDir()

	pageOrder := PageOrder{
		Order: order,
	}

	data, _ := json.MarshalIndent(pageOrder, "", "  ")
	os.WriteFile(fs.pageOrderFile, data, 0644)
}

func (fs *FileStore) SavePage(page Page, bookmarks []Bookmark) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()
	// The page ID IS the file number
	// bookmarks-1.json has page.id = 1
	// When saving, try to preserve existing categories stored in the file
	fileName := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, page.ID)

	var existing PageWithBookmarks
	if data, err := os.ReadFile(fileName); err == nil {
		_ = json.Unmarshal(data, &existing)
	}

	pageWithBookmarks := PageWithBookmarks{
		Page:       page,
		Categories: existing.Categories,
		Bookmarks:  bookmarks,
	}

	if pageWithBookmarks.Categories == nil {
		pageWithBookmarks.Categories = getDefaultNewPageCategories()
	}

	data, _ := json.MarshalIndent(pageWithBookmarks, "", "  ")
	os.WriteFile(fileName, data, 0644)
}

func (fs *FileStore) DeletePage(pageID int) error {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	// Delete bookmarks-{pageID}.json
	filePath := fmt.Sprintf("%s/bookmarks-%d.json", fs.dataDir, pageID)
	return os.Remove(filePath)
}

func (fs *FileStore) GetSettings() Settings {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	fs.ensureDataDir()

	data, err := os.ReadFile(fs.settingsFile)
	if err != nil {
		// Return default settings if file doesn't exist
		return Settings{
			CurrentPage:               1,
			Theme:                     "dark",
			OpenInNewTab:              true,
			ColumnsPerRow:             3,
			FontSize:                  "m",
			ShowBackgroundDots:        true,
			ShowTitle:                 true,
			ShowDate:                  true,
			ShowConfigButton:          true,
			ShowSearchButton:          true,
			ShowFindersButton:         false,
			ShowCommandsButton:        false,
			ShowCheatSheetButton:      true,
			ShowSearchButtonText:      true,
			ShowFindersButtonText:     true,
			ShowCommandsButtonText:    true,
			ShowStatus:                false,
			ShowPing:                  false,
			ShowStatusLoading:         false,
			SkipFastPing:              false,
			GlobalShortcuts:           true,
			HyprMode:                  false,
			AnimationsEnabled:         true,
			EnableCustomTitle:         false,
			CustomTitle:               "",
			ShowPageInTitle:           false,
			ShowPageNamesInTabs:       false,
			EnableCustomFavicon:       false,
			CustomFaviconPath:         "",
			EnableCustomFont:          false,
			CustomFontPath:            "",
			Language:                  "en",
			InterleaveMode:            false,
			ShowPageTabs:              true,
			AlwaysCollapseCategories:  false,
			EnableFuzzySuggestions:    false,
			FuzzySuggestionsStartWith: false,
			KeepSearchOpenWhenEmpty:   false,
			ShowIcons:                 false,
			IncludeFindersInSearch:    false,
			BackgroundOpacity:         1,
			FontWeight:                "normal",
			AutoDarkMode:              false,
			ShowSmartRecentCollection: true,
			ShowSmartStaleCollection:  true,
			SmartRecentPageIds:        []int{},
			SmartStalePageIds:         []int{},
		}
	}

	var settings Settings
	json.Unmarshal(data, &settings)

	var rawSettings map[string]json.RawMessage
	if err := json.Unmarshal(data, &rawSettings); err == nil {
		if _, ok := rawSettings["showCheatSheetButton"]; !ok {
			settings.ShowCheatSheetButton = true
		}
		if _, ok := rawSettings["showSmartRecentCollection"]; !ok {
			settings.ShowSmartRecentCollection = true
		}
		if _, ok := rawSettings["showSmartStaleCollection"]; !ok {
			settings.ShowSmartStaleCollection = true
		}
		if _, ok := rawSettings["smartRecentPageIds"]; !ok || settings.SmartRecentPageIds == nil {
			settings.SmartRecentPageIds = []int{}
		}
		if _, ok := rawSettings["smartStalePageIds"]; !ok || settings.SmartStalePageIds == nil {
			settings.SmartStalePageIds = []int{}
		}
	}

	// Set default language if empty
	if settings.Language == "" {
		settings.Language = "en"
	}

	return settings
}

func (fs *FileStore) SaveSettings(settings Settings) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	data, _ := json.MarshalIndent(settings, "", "  ")
	os.WriteFile(fs.settingsFile, data, 0644)
}

func getDefaultColors() ColorTheme {
	return ColorTheme{
		Light: ThemeColors{
			TextPrimary:         "#1F2937",
			TextSecondary:       "#6B7280",
			TextTertiary:        "#9CA3AF",
			BackgroundPrimary:   "#F9FAFB",
			BackgroundSecondary: "#F3F4F6",
			BackgroundDots:      "#E5E7EB",
			BackgroundModal:     "rgba(255, 255, 255, 0.9)",
			BorderPrimary:       "#D1D5DB",
			BorderSecondary:     "#E5E7EB",
			AccentSuccess:       "#059669",
			AccentWarning:       "#D97706",
			AccentError:         "#DC2626",
		},
		Dark: ThemeColors{
			TextPrimary:         "#E5E7EB",
			TextSecondary:       "#9CA3AF",
			TextTertiary:        "#6B7280",
			BackgroundPrimary:   "#000",
			BackgroundSecondary: "#1F2937",
			BackgroundDots:      "#1F2937",
			BackgroundModal:     "rgba(0, 0, 0, 0.8)",
			BorderPrimary:       "#4B5563",
			BorderSecondary:     "#374151",
			AccentSuccess:       "#10B981",
			AccentWarning:       "#F59E0B",
			AccentError:         "#EF4444",
		},
		Custom: builtinCustomThemes(),
	}
}

func builtinCustomThemes() map[string]ThemeColors {
	return map[string]ThemeColors{
		"nerd": {
			Name:                "nerd",
			TextPrimary:         "#BFFFE5",
			TextSecondary:       "#7EE6C3",
			TextTertiary:        "#4DBF9F",
			BackgroundPrimary:   "#04080F",
			BackgroundSecondary: "#08111E",
			BackgroundDots:      "#102137",
			BackgroundModal:     "rgba(4, 8, 15, 0.98)",
			BorderPrimary:       "#21C7A8",
			BorderSecondary:     "#4A90E2",
			AccentSuccess:       "#22C55E",
			AccentWarning:       "#F59E0B",
			AccentError:         "#FB7185",
		},
		"midnight": {
			Name:                "midnight",
			TextPrimary:         "#F8FAFC",
			TextSecondary:       "#CBD5E1",
			TextTertiary:        "#94A3B8",
			BackgroundPrimary:   "#081120",
			BackgroundSecondary: "#111B2E",
			BackgroundDots:      "#1A2740",
			BackgroundModal:     "rgba(8, 17, 32, 0.97)",
			BorderPrimary:       "#6D7CFF",
			BorderSecondary:     "#8B5CF6",
			AccentSuccess:       "#38BDF8",
			AccentWarning:       "#FBBF24",
			AccentError:         "#F87171",
		},
		"forest": {
			Name:                "forest",
			TextPrimary:         "#F0FFF4",
			TextSecondary:       "#B7F7D2",
			TextTertiary:        "#7CDFA5",
			BackgroundPrimary:   "#071A12",
			BackgroundSecondary: "#123224",
			BackgroundDots:      "#1D4F33",
			BackgroundModal:     "rgba(7, 26, 18, 0.97)",
			BorderPrimary:       "#16A34A",
			BorderSecondary:     "#34D399",
			AccentSuccess:       "#22C55E",
			AccentWarning:       "#EAB308",
			AccentError:         "#EF4444",
		},
		"sunset": {
			Name:                "sunset",
			TextPrimary:         "#FFF8F0",
			TextSecondary:       "#FFD0A8",
			TextTertiary:        "#FF9A76",
			BackgroundPrimary:   "#2A0E2A",
			BackgroundSecondary: "#4B1546",
			BackgroundDots:      "#7A1E3A",
			BackgroundModal:     "rgba(42, 14, 42, 0.97)",
			BorderPrimary:       "#F97316",
			BorderSecondary:     "#FB7185",
			AccentSuccess:       "#F59E0B",
			AccentWarning:       "#FDBA74",
			AccentError:         "#F43F5E",
		},
		"paper": {
			Name:                "paper",
			TextPrimary:         "#1E293B",
			TextSecondary:       "#475569",
			TextTertiary:        "#64748B",
			BackgroundPrimary:   "#FFFDF7",
			BackgroundSecondary: "#F4EFE6",
			BackgroundDots:      "#D9D1C7",
			BackgroundModal:     "rgba(255, 253, 247, 0.98)",
			BorderPrimary:       "#C8B8A8",
			BorderSecondary:     "#E5DDD2",
			AccentSuccess:       "#0F766E",
			AccentWarning:       "#C2410C",
			AccentError:         "#B91C1C",
		},
	}
}

func (fs *FileStore) GetColors() ColorTheme {
	fs.mutex.RLock()
	defer fs.mutex.RUnlock()

	fs.ensureDataDir()

	data, err := os.ReadFile(fs.colorsFile)
	if err != nil {
		// Return default colors if file doesn't exist
		return getDefaultColors()
	}

	var colors ColorTheme
	if err := json.Unmarshal(data, &colors); err != nil {
		return getDefaultColors()
	}

	// Ensure custom themes map is initialized
	if colors.Custom == nil {
		colors.Custom = make(map[string]ThemeColors)
	}

	for themeID, theme := range builtinCustomThemes() {
		if _, exists := colors.Custom[themeID]; !exists {
			colors.Custom[themeID] = theme
		}
	}

	return colors
}

func (fs *FileStore) SaveColors(colors ColorTheme) {
	fs.mutex.Lock()
	defer fs.mutex.Unlock()

	fs.ensureDataDir()

	data, _ := json.MarshalIndent(colors, "", "  ")
	os.WriteFile(fs.colorsFile, data, 0644)
}

// Analytics and metadata types
type BookmarkAnalytics struct {
	MostOpened     []BookmarkWithCount `json:"mostOpened"`
	LeastUsed      []BookmarkWithCount `json:"leastUsed"`
	StaleBookmarks []BookmarkWithCount `json:"staleBookmarks"`
	TotalBookmarks int                 `json:"totalBookmarks"`
	UnusedCount    int                 `json:"unusedCount"`
	StaleCount     int                 `json:"staleCount"`
}

type BookmarkWithCount struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	OpenCount  int    `json:"openCount"`
	LastOpened int64  `json:"lastOpened,omitempty"`
	PageID     int    `json:"pageId,omitempty"`
}

type DuplicateWarning struct {
	DuplicateURLs []DuplicateGroup `json:"duplicateUrls"`
}

type DuplicateGroup struct {
	URL        string        `json:"url"`
	Bookmarks  []BookmarkRef `json:"bookmarks"`
	MatchScore float64       `json:"matchScore"`
}

type BookmarkRef struct {
	Name   string `json:"name"`
	Index  int    `json:"index"`
	PageID int    `json:"pageId"`
}

// Search indexing
type SearchIndex struct {
	Entries []SearchEntry `json:"entries"`
}

type SearchEntry struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	Shortcut string `json:"shortcut"`
	Category string `json:"category"`
	Keywords string `json:"keywords"` // Combined searchable text
	Index    int    `json:"index"`
	PageID   int    `json:"pageId"`
}

// Undo/Redo history
type HistoryEntry struct {
	Timestamp   int64     `json:"timestamp"`
	Action      string    `json:"action"` // "add", "remove", "update", "move"
	PageID      int       `json:"pageId"`
	Bookmark    *Bookmark `json:"bookmark,omitempty"`
	OldBookmark *Bookmark `json:"oldBookmark,omitempty"`
	Index       int       `json:"index"`
}

type UndoRedoManager struct {
	History      []HistoryEntry
	CurrentIndex int
}

// Bookmark preview metadata
type BookmarkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Domain      string `json:"domain"`
	Icon        string `json:"icon"`
	FetchedAt   int64  `json:"fetchedAt"`
}
