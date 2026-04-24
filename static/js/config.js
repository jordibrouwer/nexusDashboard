/**
 * Main Configuration Manager
 * Orchestrates all configuration modules
 */

class ConfigManager {
    constructor() {
        // Initialize modules
        this.storage = new ConfigStorage();
        this.data = new ConfigData(this.storage);
        this.ui = new ConfigUI();
        this.language = new ConfigLanguage();
        this.pages = new ConfigPages(this.language.t.bind(this.language));
        this.categories = new ConfigCategories(this.language.t.bind(this.language));
        this.bookmarks = new ConfigBookmarks(this.language.t.bind(this.language));
        window.configBookmarks = this.bookmarks;
        this.finders = new ConfigFinders(this.language.t.bind(this.language));
        this.backup = new ConfigBackup(this.language.t.bind(this.language));
        this.settings = new ConfigSettings(this.language);

        // Data
        this.pagesData = [];
        this.originalPagesData = []; // Track original pages to detect deletions
        this.currentPageId = 1; // Default to page 1
        this.currentCategoriesPageId = 1; // Default to page 1 for categories
        this.bookmarksData = [];
        this.findersData = [];
        this.categoriesData = []; // Categories for the categories tab
        this.bookmarksPageCategories = []; // Categories for the bookmarks tab (read-only)
        this.currentBookmarksCategoryFilter = '__all__';
        this.settingsData = {
            currentPage: 'default',
            theme: 'dark',
            openInNewTab: true,
            columnsPerRow: 3,
            fontSize: 'm',
            showBackgroundDots: true,
            showTitle: true,
            showDate: true,
            showCheatSheetButton: true,
            showRecentButton: true,
            showStatus: false,
            showPing: false,
            skipFastPing: false,
            globalShortcuts: true,
            hyprMode: false,
            showPageNamesInTabs: false,
            enableCustomFavicon: false,
            customFaviconPath: '',
            enableCustomFont: false,
            customFontPath: '',
            language: 'en',
            interleaveMode: false,
            showPageTabs: true,
            enableFuzzySuggestions: false,
            fuzzySuggestionsStartWith: false,
            keepSearchOpenWhenEmpty: false,
            showIcons: false,
            sortMethod: 'order',
            layoutPreset: 'default',
            backgroundOpacity: 1,
            fontWeight: 'normal',
            autoDarkMode: false,
            showSmartRecentCollection: false,
            showSmartStaleCollection: false,
            smartRecentLimit: 50,
            smartRecentPageIds: [],
            smartStalePageIds: []
        };
        this.deviceSpecific = false;

        this.init();
    }

    async init() {
        await this.loadData();
        await this.language.init(this.settingsData.language);
        this.setupDOM();
        await this.setupEventListeners();
        this.language.setupLanguageSelector();
        
        // Set language for global modal
        if (window.AppModal) {
            window.AppModal.setLanguage(this.language);
        }
        this.renderConfig();
        this.initReordering();
        
        if (typeof initCustomSelects === 'function') {
            setTimeout(() => initCustomSelects(), 0);
        }

        document.body.classList.remove('loading');

        const categoriesSelector = document.getElementById('categories-page-selector');
        if (categoriesSelector) {
            this.currentCategoriesPageId = parseInt(this.currentPageId);
            this.loadPageCategories(this.currentPageId);
        }
    }

    async loadData() {
        try {
            this.deviceSpecific = this.storage.getDeviceSpecificFlag();
            const { bookmarks, pages, settings } = await this.data.loadData(this.deviceSpecific);

            this.bookmarksData = bookmarks;
            this.pagesData = pages;
            this.originalPagesData = JSON.parse(JSON.stringify(pages));
            this.findersData = await this.data.loadFinders();
            this.settingsData = { ...this.settingsData, ...settings };
            if (!this.settingsData.language || this.settingsData.language === "") {
                this.settingsData.language = 'en';
            }
            if (typeof this.settingsData.interleaveMode === 'undefined') {
                this.settingsData.interleaveMode = false;
            }
            if (typeof this.settingsData.showPageTabs === 'undefined') {
                this.settingsData.showPageTabs = true;
            }
            if (typeof this.settingsData.showSmartRecentCollection === 'undefined') {
                this.settingsData.showSmartRecentCollection = false;
            }
            if (typeof this.settingsData.showSmartStaleCollection === 'undefined') {
                this.settingsData.showSmartStaleCollection = false;
            }
            if (typeof this.settingsData.showRecentButton === 'undefined') {
                this.settingsData.showRecentButton = true;
            }
            if (!Number.isFinite(Number(this.settingsData.smartRecentLimit)) || Number(this.settingsData.smartRecentLimit) < 0) {
                this.settingsData.smartRecentLimit = 50;
            } else {
                this.settingsData.smartRecentLimit = Number(this.settingsData.smartRecentLimit);
            }
            if (!Array.isArray(this.settingsData.smartRecentPageIds)) {
                this.settingsData.smartRecentPageIds = [];
            }
            if (!Array.isArray(this.settingsData.smartStalePageIds)) {
                this.settingsData.smartStalePageIds = [];
            }
            this.currentPageId = settings.currentPage || 1;
            
            await this.loadPageBookmarks(this.currentPageId);
        } catch (error) {
            this.ui.showNotification(this.language.t('config.errorLoadingConfig'), 'error');
        }
    }

    async loadPageBookmarks(pageId) {
        try {
            this.currentPageId = parseInt(pageId);
            this.bookmarksData = await this.data.loadBookmarksByPage(pageId);
            this.bookmarksPageCategories = (await this.data.loadCategoriesByPage(pageId)).map(cat => ({ ...cat }));

            this.refreshBookmarksFilterOptions();
            this.refreshBookmarksList();
        } catch (error) {
            this.ui.showNotification(this.language.t('config.errorLoadingBookmarks'), 'error');
        }
    }

    async loadPageCategories(pageId) {
        try {
            this.currentCategoriesPageId = parseInt(pageId);
            this.categoriesData = (await this.data.loadCategoriesByPage(pageId)).map(cat => ({ ...cat }));
            this.categories.render(this.categoriesData, this.generateId.bind(this));
            this.categories.initReorder(this.categoriesData, (newCategories) => {
                this.categoriesData = newCategories;
            });
        } catch (error) {
            this.ui.showNotification(this.language.t('config.errorLoadingCategories'), 'error');
        }
    }

    setupDOM() {
        this.settings.applyTheme(this.settingsData.theme);
        this.settings.applyFontSize(this.settingsData.fontSize);
        this.settings.applyBackgroundDots(this.settingsData.showBackgroundDots);
        this.settings.applyAnimations(this.settingsData.animationsEnabled);
        if (window.LayoutUtils) {
            this.settingsData.layoutPreset = window.LayoutUtils.applyLayoutPreset(this.settingsData, this.settingsData.layoutPreset || 'default');
        } else {
            document.body.setAttribute('data-layout-preset', this.settingsData.layoutPreset || 'default');
        }
        this.settings.applyBackgroundOpacity(this.settingsData.backgroundOpacity);
        this.settings.applyFontWeight(this.settingsData.fontWeight);
        this.settings.applyAutoDarkMode(this.settingsData.autoDarkMode, this.settingsData);
    }

    async setupEventListeners() {
        // Setup input validation
        this.setupInputValidation();
        
        // Setup settings listeners with callbacks
        await this.settings.setupListeners(this.settingsData, {
            onThemeChange: (theme) => {
                this.settings.applyTheme(theme);
            },
            onFontSizeChange: (fontSize) => {
                this.settings.applyFontSize(fontSize);
            },
            onBackgroundDotsChange: (show) => {
                this.settings.applyBackgroundDots(show);
            },
            onAnimationsChange: (enabled) => {
                this.settings.applyAnimations(enabled);
            },
            onLayoutPresetChange: (preset) => {
                if (window.LayoutUtils) {
                    this.settingsData.layoutPreset = window.LayoutUtils.applyLayoutPreset(this.settingsData, preset || 'default');
                } else {
                    document.body.setAttribute('data-layout-preset', preset || 'default');
                }
            },
            onBackgroundOpacityChange: (value) => {
                this.settings.applyBackgroundOpacity(value);
            },
            onFontWeightChange: (value) => {
                this.settings.applyFontWeight(value);
            },
            onAutoDarkModeChange: (enabled) => {
                this.settings.applyAutoDarkMode(enabled, this.settingsData);
            },
            onStatusVisibilityChange: () => {
                this.settings.updateStatusOptionsVisibility(this.settingsData.showStatus);
            }
        });



        const deviceSpecificCheckbox = document.getElementById('device-specific-checkbox');
        if (deviceSpecificCheckbox) {
            deviceSpecificCheckbox.checked = this.deviceSpecific;
            deviceSpecificCheckbox.addEventListener('change', async (e) => {
                this.deviceSpecific = e.target.checked;
                this.storage.setDeviceSpecificFlag(this.deviceSpecific);
                
                const message = this.deviceSpecific 
                    ? this.language.t('config.deviceSpecificEnabled')
                    : this.language.t('config.deviceSpecificDisabled');
                
                if (this.deviceSpecific) {
                    this.storage.saveDeviceSettings(this.settingsData);
                } else {
                    this.storage.clearDeviceSettings();
                }
                this.ui.showNotification(message, 'success');
            });
        }

        this.settings.updateStatusOptionsVisibility(this.settingsData.showStatus);

        const addPageBtn = document.getElementById('add-page-btn');
        if (addPageBtn) addPageBtn.addEventListener('click', () => this.addPage());

        const addCategoryBtn = document.getElementById('add-category-btn');
        if (addCategoryBtn) addCategoryBtn.addEventListener('click', () => this.addCategory());

        const addBookmarkBtn = document.getElementById('add-bookmark-btn');
        if (addBookmarkBtn) addBookmarkBtn.addEventListener('click', () => this.addBookmark());

        const selectAllBookmarksBtn = document.getElementById('select-all-bookmarks-btn');
        if (selectAllBookmarksBtn) {
            selectAllBookmarksBtn.addEventListener('click', () => {
                this.bookmarks.selectAllVisible();
            });
        }

        const clearBookmarkSelectionBtn = document.getElementById('clear-bookmark-selection-btn');
        if (clearBookmarkSelectionBtn) {
            clearBookmarkSelectionBtn.addEventListener('click', () => {
                this.bookmarks.clearSelection();
            });
        }

        const bulkDeleteBookmarksBtn = document.getElementById('bulk-delete-bookmarks-btn');
        if (bulkDeleteBookmarksBtn) {
            bulkDeleteBookmarksBtn.addEventListener('click', async () => {
                const removed = await this.bookmarks.bulkDelete(this.bookmarksData);
                if (removed) {
                    this.refreshBookmarksList();
                }
            });
        }

        const bulkApplyCategoryBtn = document.getElementById('bulk-apply-category-btn');
        const bulkCategorySelect = document.getElementById('bulk-category-select');
        if (bulkApplyCategoryBtn && bulkCategorySelect) {
            bulkApplyCategoryBtn.addEventListener('click', () => {
                this.bookmarks.bulkUpdateCategory(this.bookmarksData, bulkCategorySelect.value);
                this.refreshBookmarksList();
            });
        }

        const bulkTogglePinBtn = document.getElementById('bulk-toggle-pin-btn');
        if (bulkTogglePinBtn) {
            bulkTogglePinBtn.addEventListener('click', () => {
                this.bookmarks.bulkTogglePin(this.bookmarksData);
                this.refreshBookmarksList();
            });
        }

        const addFinderBtn = document.getElementById('add-finder-btn');
        if (addFinderBtn) addFinderBtn.addEventListener('click', () => this.addFinder());

        const pageSelector = document.getElementById('page-selector');
        if (pageSelector) {
            pageSelector.addEventListener('change', (e) => this.loadPageBookmarks(e.target.value));
        }

        const bookmarksFilterSelector = document.getElementById('bookmarks-category-filter');
        if (bookmarksFilterSelector) {
            bookmarksFilterSelector.addEventListener('change', (e) => {
                this.currentBookmarksCategoryFilter = e.target.value;
                this.refreshBookmarksList();
            });
        }

        const categoriesPageSelector = document.getElementById('categories-page-selector');
        if (categoriesPageSelector) {
            categoriesPageSelector.addEventListener('change', (e) => {
                this.currentCategoriesPageId = parseInt(e.target.value);
                this.loadPageCategories(e.target.value);
            });
        }

        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveChanges());

        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetToDefaults());
    }

    setupCascadingCheckboxes() {
        // Define parent-child relationships for checkboxes
        const cascadingPairs = [
            { parent: 'show-search-button-checkbox', children: ['show-search-button-text-checkbox'] },
            { parent: 'show-finders-button-checkbox', children: ['show-finders-button-text-checkbox'] },
            { parent: 'show-commands-button-checkbox', children: ['show-commands-button-text-checkbox'] },
            { parent: 'show-status-checkbox', children: ['show-ping-checkbox', 'show-status-loading-checkbox', 'skip-fast-ping-checkbox'] },
            { parent: 'enable-custom-title-checkbox', children: ['custom-title-input', 'show-page-in-title-checkbox'] },
            { parent: 'enable-fuzzy-suggestions-checkbox', children: ['fuzzy-suggestions-start-with-checkbox'] },
            { parent: 'enable-custom-favicon-checkbox', children: ['custom-favicon-input'] },
            { parent: 'enable-custom-font-checkbox', children: ['custom-font-input'] }
        ];

        // Set up event listeners for each parent checkbox
        cascadingPairs.forEach(pair => {
            const parentCheckbox = document.getElementById(pair.parent);
            if (parentCheckbox) {
                parentCheckbox.addEventListener('change', (e) => {
                    pair.children.forEach(childId => {
                        const childElement = document.getElementById(childId);
                        if (childElement) {
                            if (childElement.type === 'checkbox') {
                                childElement.disabled = !e.target.checked;
                                // Visual feedback: gray out child if disabled
                                const parentItem = childElement.closest('.checkbox-tree-child');
                                if (parentItem) {
                                    if (!e.target.checked) {
                                        parentItem.style.opacity = '0.5';
                                        parentItem.style.pointerEvents = 'none';
                                    } else {
                                        parentItem.style.opacity = '1';
                                        parentItem.style.pointerEvents = 'auto';
                                    }
                                }
                            } else if (childElement.type === 'file' || childElement.tagName === 'INPUT') {
                                childElement.disabled = !e.target.checked;
                                const parentItem = childElement.closest('.checkbox-tree-child');
                                if (parentItem) {
                                    if (!e.target.checked) {
                                        parentItem.style.opacity = '0.5';
                                        parentItem.style.pointerEvents = 'none';
                                    } else {
                                        parentItem.style.opacity = '1';
                                        parentItem.style.pointerEvents = 'auto';
                                    }
                                }
                            }
                        }
                    });
                });
                
                // Initialize disabled state on load
                const isChecked = parentCheckbox.checked;
                pair.children.forEach(childId => {
                    const childElement = document.getElementById(childId);
                    if (childElement) {
                        childElement.disabled = !isChecked;
                        if (!isChecked) {
                            const parentItem = childElement.closest('.checkbox-tree-child');
                            if (parentItem) {
                                parentItem.style.opacity = '0.5';
                                parentItem.style.pointerEvents = 'none';
                            }
                        }
                    }
                });
            }
        });
    }

    setupInputValidation() {
        // Validate columns input (1-6)
        const columnsInput = document.getElementById('columns-input');
        if (columnsInput) {
            columnsInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value);
                if (isNaN(value)) value = 3;
                if (value < 1) value = 1;
                if (value > 6) value = 6;
                e.target.value = value;
            });
        }

        // Validate custom title (max length handled by maxlength attribute)
        const customTitleInput = document.getElementById('custom-title-input');
        if (customTitleInput) {
            customTitleInput.addEventListener('input', (e) => {
                // Show character count feedback if near limit
                if (e.target.value.length > 85) {
                    e.target.title = `${e.target.value.length} / 100 characters`;
                } else {
                    e.target.title = '';
                }
            });
        }

        // File input validation
        const faviconInput = document.getElementById('custom-favicon-input');
        if (faviconInput) {
            faviconInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const maxSize = 1024 * 1024; // 1MB
                    if (file.size > maxSize) {
                        this.ui.showNotification(this.language.t('config.fileTooLarge') || 'File is too large (max 1MB)', 'error');
                        e.target.value = '';
                        return;
                    }
                    const validTypes = ['image/x-icon', 'image/png', 'image/jpeg', 'image/gif'];
                    if (!validTypes.includes(file.type)) {
                        this.ui.showNotification(this.language.t('config.invalidFileType') || 'Invalid file type', 'error');
                        e.target.value = '';
                    }
                }
            });
        }

        const fontInput = document.getElementById('custom-font-input');
        if (fontInput) {
            fontInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (file.size > maxSize) {
                        this.ui.showNotification(this.language.t('config.fileTooLarge') || 'File is too large (max 5MB)', 'error');
                        e.target.value = '';
                        return;
                    }
                    const validTypes = ['font/woff', 'font/woff2', 'font/ttf', 'font/otf'];
                    if (!validTypes.includes(file.type)) {
                        this.ui.showNotification(this.language.t('config.invalidFileType') || 'Invalid file type', 'error');
                        e.target.value = '';
                    }
                }
            });
        }
    }

    renderConfig() {
        this.pages.render(this.pagesData, this.generateId.bind(this));
        if (this.settings && typeof this.settings.populateSmartPageSelectors === 'function') {
            this.settings.populateSmartPageSelectors(this.pagesData, this.settingsData);
        }
        
        const pageSelector = document.getElementById('page-selector');
        if (pageSelector && pageSelector.value) {
            this.currentPageId = parseInt(pageSelector.value);
        }
        this.pages.renderPageSelector(this.pagesData, this.currentPageId);

        const categoriesSelector = document.getElementById('categories-page-selector');
        if (categoriesSelector) {
            if (categoriesSelector.value) {
                this.currentCategoriesPageId = parseInt(categoriesSelector.value);
            }
            
            categoriesSelector.innerHTML = '';
            this.pagesData.forEach(page => {
                const option = document.createElement('option');
                option.value = page.id;
                option.textContent = page.name;
                if (page.id === this.currentCategoriesPageId) option.selected = true;
                categoriesSelector.appendChild(option);
            });
        }

        this.refreshBookmarksFilterOptions();
        this.refreshBookmarksList();
        this.finders.render(this.findersData);
        this.refreshCustomSelects();
        
        // Set checkbox states
        const interleaveModeCheckbox = document.getElementById('interleave-mode-checkbox');
        if (interleaveModeCheckbox) interleaveModeCheckbox.checked = this.settingsData.interleaveMode;
    }

    refreshCustomSelects() {
        const selects = document.querySelectorAll('select[data-custom-select-init="true"]');
        
        selects.forEach(select => {
            const wrapper = select.closest('.custom-select-wrapper');
            if (!wrapper) return;

            const optionsContainer = wrapper.querySelector('.custom-select-options');
            const trigger = wrapper.querySelector('.custom-select-trigger .custom-select-text');
            
            if (optionsContainer && trigger) {
                optionsContainer.innerHTML = '';
                
                Array.from(select.options).forEach((option, index) => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'custom-select-option';
                    optionDiv.textContent = option.textContent;
                    optionDiv.dataset.value = option.value;
                    optionDiv.dataset.index = index;
                    
                    if (option.selected) optionDiv.classList.add('selected');
                    
                    optionDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        select.selectedIndex = index;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        trigger.textContent = option.textContent;
                        optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        optionDiv.classList.add('selected');
                        wrapper.querySelector('.custom-select').classList.remove('open');
                    });
                    
                    optionsContainer.appendChild(optionDiv);
                });
                
                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption) trigger.textContent = selectedOption.textContent;
            }
        });
    }

    initReordering() {
        this.pages.initReorder(this.pagesData, (newPages) => {
            this.pagesData = newPages;
            this.pages.renderPageSelector(this.pagesData, this.currentPageId);
        });

        this.categories.initReorder(this.categoriesData, (newCategories) => {
            this.categoriesData = newCategories;
        });

        this.refreshBookmarksList();

        this.finders.initReorder(this.findersData, (newFinders) => {
            this.findersData = newFinders;
        });
    }

    async addPage() {
        const newPage = this.pages.add(this.pagesData, this.generateId.bind(this));
        
        const defaultCategories = [{ id: 'others', name: this.language.t('dashboard.others') }];
        try {
            await this.data.saveCategoriesByPage(defaultCategories, newPage.id);
            await this.data.saveBookmarks([], newPage.id);
        } catch (error) {
            console.error('Error creating new page:', error);
        }
        
        this.pages.render(this.pagesData, this.generateId.bind(this));
        this.pages.renderPageSelector(this.pagesData, newPage.id);
        this.pages.initReorder(this.pagesData, (newPages) => {
            this.pagesData = newPages;
            this.pages.renderPageSelector(this.pagesData, this.currentPageId);
        });

        const pageSelector = document.getElementById('page-selector');
        if (pageSelector) {
            pageSelector.value = String(newPage.id);
            this.currentPageId = newPage.id;
            this.loadPageBookmarks(newPage.id);
        }

        const categoriesSelector = document.getElementById('categories-page-selector');
        if (categoriesSelector) {
            categoriesSelector.innerHTML = '';
            this.pagesData.forEach(page => {
                const option = document.createElement('option');
                option.value = page.id;
                option.textContent = page.name;
                if (page.id === newPage.id) option.selected = true;
                categoriesSelector.appendChild(option);
            });
            
            this.currentCategoriesPageId = newPage.id;
            this.loadPageCategories(newPage.id);
        }
    }

    addCategory() {
        if (!this.categoriesData) this.categoriesData = [];
        
        this.categories.add(this.categoriesData, this.generateId.bind(this));
        this.categories.render(this.categoriesData, this.generateId.bind(this));
        this.categories.initReorder(this.categoriesData, (newCategories) => {
            this.categoriesData = newCategories;
        });
    }

    addBookmark() {
        const newBookmark = this.bookmarks.add(this.bookmarksData);
        this.warnDuplicateUrl(newBookmark.url);
        this.refreshBookmarksList();
    }

    addFinder() {
        this.finders.add(this.findersData);
        this.finders.render(this.findersData);
        this.finders.initReorder(this.findersData, (newFinders) => {
            this.findersData = newFinders;
        });
    }

    async removePage(index) {
        const page = this.pagesData[index];
        if (!page) return;
        
        if (page.id === 1) {
            this.ui.showNotification(this.language.t('config.cannotRemoveMainPage'), 'error');
            return;
        }
        
        const confirmed = await window.AppModal.danger({
            title: this.language.t('config.removePageTitle'),
            message: this.language.t('config.removePageMessage').replace('{pageName}', page.name),
            confirmText: this.language.t('config.remove'),
            cancelText: this.language.t('config.cancel')
        });
        
        if (!confirmed) return;
        
        try {
            await this.data.deletePage(page.id);
            
            this.pagesData.splice(index, 1);
            
            const origIndex = this.originalPagesData.findIndex(p => p.id === page.id);
            if (origIndex !== -1) {
                this.originalPagesData.splice(origIndex, 1);
            }
            
            this.pages.render(this.pagesData, this.generateId.bind(this));
            this.pages.renderPageSelector(this.pagesData, 1);
            this.pages.initReorder(this.pagesData, (newPages) => {
                this.pagesData = newPages;
                this.pages.renderPageSelector(this.pagesData, this.currentPageId);
            });
            
            this.currentPageId = 1;
            this.currentCategoriesPageId = 1;
            await this.loadPageBookmarks(1);
            await this.loadPageCategories(1);
            
            const pageSelector = document.getElementById('page-selector');
            if (pageSelector) pageSelector.value = '1';
            
            const categoriesSelector = document.getElementById('categories-page-selector');
            if (categoriesSelector) {
                categoriesSelector.innerHTML = '';
                this.pagesData.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = p.name;
                    if (p.id === 1) option.selected = true;
                    categoriesSelector.appendChild(option);
                });
            }
            
            this.ui.showNotification(this.language.t('config.pageDeleted'), 'success');
        } catch (error) {
            console.error('Error deleting page:', error);
            this.ui.showNotification(this.language.t('config.errorDeletingPage'), 'error');
        }
    }

    async removeCategory(index) {
        const category = this.categoriesData[index];
        if (!category) return;
        
        const removed = await this.categories.remove(this.categoriesData, index);
        if (removed) {
            if (this.currentPageId === this.currentCategoriesPageId) {
                this.bookmarksData.forEach(bookmark => {
                    if (bookmark.category === category.id) {
                        bookmark.category = '';
                    }
                });
            }
            
            this.categories.render(this.categoriesData, this.generateId.bind(this));
            this.categories.initReorder(this.categoriesData, (newCategories) => {
                this.categoriesData = newCategories;
            });
            this.ui.showNotification(this.language.t('config.categoryRemoved'), 'success');
        }
    }

    async removeBookmark(index) {
        const removed = await this.bookmarks.remove(this.bookmarksData, index);
        if (removed) {
            this.refreshBookmarksList();
        }
    }

    async removeFinder(index) {
        const removed = await this.finders.remove(this.findersData, index);
        if (removed) {
            this.finders.render(this.findersData);
            this.finders.initReorder(this.findersData, (newFinders) => {
                this.findersData = newFinders;
            });
        }
    }

    async moveBookmark(index) {
        const bookmark = this.bookmarksData[index];
        if (!bookmark) return;

        // Create page options
        const pageOptions = this.pagesData
            .map(page => {
                const isCurrent = page.id === this.currentPageId;
                return `<button class="modal-page-btn ${isCurrent ? 'current' : ''}" ${isCurrent ? 'disabled' : `onclick="window.tempMoveBookmark(${index}, ${page.id})"`}>${page.name}${isCurrent ? ' (current)' : ''}</button>`;
            })
            .join('');

        const html = `
            <p>${this.language.t('config.moveBookmarkMessage')}</p>
            <div class="modal-page-list">
                ${pageOptions}
            </div>
        `;

        // Define temp function
        window.tempMoveBookmark = async (idx, pid) => {
            await this.doMoveBookmark(idx, pid);
            AppModal.hide();
        };

        await window.AppModal.confirm({
            title: this.language.t('config.moveBookmarkTitle'),
            htmlMessage: html,
            confirmText: this.language.t('config.cancel'),
            showCancel: false,
            onConfirm: () => {}
        });

        // Clean up
        delete window.tempMoveBookmark;
    }

    async doMoveBookmark(index, newPageId) {
        const bookmark = this.bookmarksData[index];
        if (!bookmark) return;

        if (newPageId === this.currentPageId) {
            this.ui.showNotification(this.language.t('config.bookmarkAlreadyHere'), 'info');
            return;
        }

        try {
            // Remove from current page
            this.bookmarksData.splice(index, 1);

            // Load bookmarks from new page
            const newPageBookmarks = await this.data.loadBookmarksByPage(newPageId);

            // Add bookmark with category cleared
            const movedBookmark = { ...bookmark, category: '' };
            newPageBookmarks.push(movedBookmark);

            // Save both pages
            await this.data.saveBookmarks(this.bookmarksData, this.currentPageId);
            await this.data.saveBookmarks(newPageBookmarks, newPageId);

            // Re-render current page
            this.refreshBookmarksList();

            this.ui.showNotification(this.language.t('config.bookmarkMoved'), 'success');
        } catch (error) {
            console.error('Error moving bookmark:', error);
            this.ui.showNotification(this.language.t('config.errorMovingBookmark'), 'error');
        }
    }

    refreshBookmarksFilterOptions() {
        const filterSelect = document.getElementById('bookmarks-category-filter');
        if (!filterSelect) {
            return;
        }

        const previousValue = this.currentBookmarksCategoryFilter || filterSelect.value || '__all__';
        const options = [];

        options.push({ value: '__all__', label: this.language.t('config.allCategories') || 'All categories' });
        options.push({ value: '__none__', label: this.language.t('config.noCategory') || 'No category' });

        this.bookmarksPageCategories.forEach((category) => {
            options.push({ value: category.id, label: category.name });
        });

        filterSelect.innerHTML = '';
        options.forEach((optionData) => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.label;
            filterSelect.appendChild(option);
        });

        const isStillValid = options.some((option) => option.value === previousValue);
        this.currentBookmarksCategoryFilter = isStillValid ? previousValue : '__all__';
        filterSelect.value = this.currentBookmarksCategoryFilter;

        const bulkCategorySelect = document.getElementById('bulk-category-select');
        if (bulkCategorySelect) {
            bulkCategorySelect.innerHTML = '';
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = 'Move to category...';
            bulkCategorySelect.appendChild(emptyOption);
            options.slice(2).forEach((optionData) => {
                const option = document.createElement('option');
                option.value = optionData.value;
                option.textContent = optionData.label;
                bulkCategorySelect.appendChild(option);
            });
        }
    }

    refreshBookmarksList(options = {}) {
        this.bookmarks.render(this.bookmarksData, this.bookmarksPageCategories, {
            filterCategory: this.currentBookmarksCategoryFilter
        });

        this.bookmarks.initReorder(this.bookmarksData, (newBookmarks, meta = {}) => {
            this.bookmarksData = newBookmarks;
            this.refreshBookmarksList(meta);
        }, {
            filterCategory: this.currentBookmarksCategoryFilter
        });

        if (typeof options.focusIndex === 'number') {
            const focusElement = document.querySelector(`[data-bookmark-index="${options.focusIndex}"] input`);
            if (focusElement) {
                focusElement.focus();
            }
        }

        if (typeof options.highlightIndex === 'number') {
            const highlightElement = document.querySelector(`[data-bookmark-index="${options.highlightIndex}"]`);
            if (highlightElement) {
                highlightElement.classList.add('reorder-highlight');
                setTimeout(() => {
                    highlightElement.classList.remove('reorder-highlight');
                }, 700);
            }
        }
    }

    getCategoriesFromDOM() {
        const categoriesList = document.getElementById('categories-list');
        if (!categoriesList) return null;

        const categoryItems = categoriesList.querySelectorAll('.category-item');
        const categories = [];

        categoryItems.forEach((item) => {
            const category = item._categoryRef;
            if (category) categories.push(category);
        });

        return categories;
    }

    async saveChanges() {
        this.ui.showNotification(this.language.t('config.savingChanges'), 'info');

        try {
            this.settings.updateFromUI(this.settingsData);
            this.settingsData.currentPage = this.pagesData.length > 0 ? this.pagesData[0].id : 1;

            const duplicateUrls = this.findDuplicateBookmarkUrls(this.bookmarksData);

            await this.data.saveBookmarks(this.bookmarksData, this.currentPageId);
            await this.data.saveFinders(this.findersData);
            
            if (this.currentCategoriesPageId) {
                const categoriesForSelectedPage = this.getCategoriesFromDOM();
                if (categoriesForSelectedPage && categoriesForSelectedPage.length >= 0) {
                    await this.data.saveCategoriesByPage(categoriesForSelectedPage, this.currentCategoriesPageId);
                }
            }
            
            await this.data.savePages(this.pagesData);
            
            if (this.deviceSpecific) {
                // Don't save global settings in localStorage
                const settingsToSave = { ...this.settingsData };
                delete settingsToSave.enableCustomFavicon;
                delete settingsToSave.customFaviconPath;
                delete settingsToSave.enableCustomFont;
                delete settingsToSave.customFontPath;
                this.storage.saveDeviceSettings(settingsToSave);
            } else {
                await this.data.saveSettings(this.settingsData);
            }

            this.originalPagesData = JSON.parse(JSON.stringify(this.pagesData));
            if (duplicateUrls.length > 0) {
                this.ui.showNotification('Configuration saved. Duplicate bookmark URLs detected.', 'warning');
            } else {
                this.ui.showNotification(this.language.t('config.configSaved'), 'success');
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            this.ui.showNotification(this.language.t('config.errorSavingConfig'), 'error');
        }
    }

    warnDuplicateUrl(url) {
        const normalized = (url || '').trim().toLowerCase();
        if (!normalized) return;

        const duplicate = this.bookmarksData.some((bookmark, index) => {
            if (index === this.bookmarksData.length - 1) return false;
            return (bookmark.url || '').trim().toLowerCase() === normalized;
        });

        if (duplicate) {
            this.ui.showNotification('Duplicate URL detected for the new bookmark.', 'warning');
        }
    }

    findDuplicateBookmarkUrls(bookmarks) {
        const seen = new Set();
        const duplicates = new Set();

        bookmarks.forEach((bookmark) => {
            const url = (bookmark.url || '').trim().toLowerCase();
            if (!url) {
                return;
            }

            if (seen.has(url)) {
                duplicates.add(url);
            } else {
                seen.add(url);
            }
        });

        return Array.from(duplicates);
    }

    async resetToDefaults() {
        const confirmed = await window.AppModal.danger({
            title: this.language.t('config.resetSettingsTitle'),
            message: this.language.t('config.resetSettingsMessage'),
            confirmText: this.language.t('config.reset'),
            cancelText: this.language.t('config.cancel')
        });
        
        if (!confirmed) return;
        this.bookmarksData = [
            { name: 'GitHub', url: 'https://github.com', shortcut: 'G', category: 'development' },
            { name: 'GitHub Issues', url: 'https://github.com/issues', shortcut: 'GI', category: 'development' },
            { name: 'GitHub Pull Requests', url: 'https://github.com/pulls', shortcut: 'GP', category: 'development' },
            { name: 'YouTube', url: 'https://youtube.com', shortcut: 'Y', category: 'media' },
            { name: 'YouTube Studio', url: 'https://studio.youtube.com', shortcut: 'YS', category: 'media' },
            { name: 'Twitter', url: 'https://twitter.com', shortcut: 'T', category: 'social' },
            { name: 'TikTok', url: 'https://tiktok.com', shortcut: 'TT', category: 'social' },
            { name: 'Google', url: 'https://google.com', shortcut: '', category: 'search' }
        ];

        this.categoriesData = [
            { id: 'development', name: 'Development' },
            { id: 'media', name: 'Media' },
            { id: 'social', name: 'Social' },
            { id: 'search', name: 'Search' },
            { id: 'utilities', name: 'Utilities' }
        ];

        this.settingsData = this.settings.getDefaults();
        document.getElementById('theme-select').value = this.settingsData.theme;
        document.getElementById('columns-input').value = this.settingsData.columnsPerRow;
        document.getElementById('font-size-select').value = this.settingsData.fontSize;
        document.getElementById('new-tab-checkbox').checked = this.settingsData.openInNewTab;
        document.getElementById('show-background-dots-checkbox').checked = this.settingsData.showBackgroundDots;
        document.getElementById('show-title-checkbox').checked = this.settingsData.showTitle;
        document.getElementById('show-date-checkbox').checked = this.settingsData.showDate;
        document.getElementById('show-config-button-checkbox').checked = this.settingsData.showConfigButton;
        document.getElementById('show-search-button-checkbox').checked = this.settingsData.showSearchButton;
        document.getElementById('show-finders-button-checkbox').checked = this.settingsData.showFindersButton;
        document.getElementById('show-commands-button-checkbox').checked = this.settingsData.showCommandsButton;
        document.getElementById('show-cheatsheet-button-checkbox').checked = this.settingsData.showCheatSheetButton;
        document.getElementById('show-search-button-text-checkbox').checked = this.settingsData.showSearchButtonText;
        document.getElementById('show-finders-button-text-checkbox').checked = this.settingsData.showFindersButtonText;
        document.getElementById('show-commands-button-text-checkbox').checked = this.settingsData.showCommandsButtonText;
        document.getElementById('include-finders-in-search-checkbox').checked = this.settingsData.includeFindersInSearch;
        document.getElementById('interleave-mode-checkbox').checked = false;
        document.getElementById('show-page-tabs-checkbox').checked = this.settingsData.showPageTabs;
        const smartRecentCheckbox = document.getElementById('show-smart-recent-collection-checkbox');
        if (smartRecentCheckbox) smartRecentCheckbox.checked = this.settingsData.showSmartRecentCollection;
        const smartStaleCheckbox = document.getElementById('show-smart-stale-collection-checkbox');
        if (smartStaleCheckbox) smartStaleCheckbox.checked = this.settingsData.showSmartStaleCollection;
        const smartRecentInput = document.getElementById('smart-recent-pages-input');
        if (smartRecentInput) smartRecentInput.value = '';
        const smartStaleInput = document.getElementById('smart-stale-pages-input');
        if (smartStaleInput) smartStaleInput.value = '';
        document.getElementById('always-collapse-categories-checkbox').checked = this.settingsData.alwaysCollapseCategories;

        this.setupDOM();
        this.renderConfig();
        this.initReordering();
        this.ui.showNotification(this.language.t('config.settingsReset'), 'success');
    }

    generateId(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
}

let configManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => configManager = new ConfigManager());
} else {
    configManager = new ConfigManager();
}
