// Dashboard JavaScript
class Dashboard {
    constructor() {
        this.bookmarks = [];
        this.allBookmarks = []; // For global shortcuts
        this.finders = [];
        this.categories = [];
        this.collapsedCategories = {};
        this.pages = [];
        this.currentPageId = 'default';
        this.settings = {
            currentPage: 'default',
            theme: 'dark',
            openInNewTab: true,
            columnsPerRow: 3,
            fontSize: 'm',
            showBackgroundDots: true,
            showTitle: true,
            showDate: true,
            showConfigButton: true,
            showCheatSheetButton: true,
            showStatus: false,
            showPing: false,
            globalShortcuts: true,
            hyprMode: false,
            enableCustomFavicon: false,
            customFaviconPath: '',
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
            autoDarkMode: false
        };
        this.searchComponent = null;
        this.statusMonitor = null;
        this.statusMonitorInitialized = false;
        this.keyboardNavigation = null;
        this.swipeNavigation = null;
        this.categoryReorderInstances = [];
        this.pendingReorderSave = null;
        this.pendingReorderSnapshot = null;
        this.pendingMetadataSave = null;
        this.notificationTimeout = null;
        this.language = new ConfigLanguage();
        this.init();
    }

    async init() {
        await this.loadData();
        this.applyVisualSettings();
        this.initializeAutoDarkMode();
        this.loadCollapsedStates();
        await this.language.init(this.settings.language);
        this.setupDOM();
        this.initializeSearchComponent();
        this.initializeStatusMonitor();
        this.initializeKeyboardNavigation();
        this.initializeSwipeNavigation();
        this.initializeHyprMode();
        this.renderPageNavigation();
        this.renderDashboard();
        this.setupPageShortcuts();
        this.setupReorderUndoShortcut();
        this.setupToolbarActions();

            // Initialize new features
            this.quickAddWidget = new QuickAddWidget(this);
            this.keyboardHelp = new KeyboardHelp();
            this.analytics = new BookmarkAnalytics(this);
            this.analytics.loadAnalytics();
            this.setupBookmarkTracking();
            this.buildSearchIndex();
        
        // Add hash change listener for navigation
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1);
            if (hash && /^\d+$/.test(hash)) {
                const pageIndex = parseInt(hash) - 1;
                if (pageIndex >= 0 && pageIndex < this.pages.length && this.pages[pageIndex].id !== this.currentPageId) {
                    this.loadPageBookmarks(this.pages[pageIndex].id);
                }
            }
        });

        // Show body after everything is loaded and rendered
        document.body.classList.remove('loading');
    }

    async loadData() {
        try {
            const [pagesRes, settingsRes, findersRes] = await Promise.all([
                fetch('/api/pages'),
                fetch('/api/settings'),
                fetch('/api/finders')
            ]);

            this.pages = await pagesRes.json();
            this.finders = await findersRes.json();
            
            // Load settings from server first
            const serverSettings = await settingsRes.json();
            
            // Load settings from localStorage or server based on device-specific flag
            const deviceSpecific = localStorage.getItem('deviceSpecificSettings') === 'true';
            if (deviceSpecific) {
                const deviceSettings = localStorage.getItem('dashboardSettings');
                this.settings = deviceSettings ? { ...serverSettings, ...JSON.parse(deviceSettings) } : serverSettings;
                // Always use favicon settings from server, regardless of device-specific
                this.settings.enableCustomFavicon = serverSettings.enableCustomFavicon;
                this.settings.customFaviconPath = serverSettings.customFaviconPath;
            } else {
                this.settings = serverSettings;
            }

            // Update document title based on custom title settings
            this.updateDocumentTitle();

            // Check for page hash in URL
            const hash = window.location.hash.substring(1);
            let initialPageId = this.pages.length > 0 ? this.pages[0].id : 'default';
            if (hash && /^\d+$/.test(hash)) {
                const pageIndex = parseInt(hash) - 1;
                if (pageIndex >= 0 && pageIndex < this.pages.length) {
                    initialPageId = this.pages[pageIndex].id;
                }
            }
            this.currentPageId = initialPageId;
            
            // Load bookmarks and categories for initial page
            await this.loadPageBookmarks(this.currentPageId);
            
            // If global shortcuts is enabled, load all bookmarks for search
            if (this.settings.globalShortcuts) {
                await this.loadAllBookmarks();
            }
        } catch (error) {
            this.showErrorNotification('Failed to load dashboard. Please refresh the page.');
        }
    }

    showNotification(message, type = 'error') {
        const notification = document.getElementById('error-notification');
        if (notification) {
            notification.textContent = message;
            notification.classList.remove('success');
            if (type === 'success') {
                notification.classList.add('success');
            }
            notification.classList.add('show');
            notification.setAttribute('aria-hidden', 'false');

            if (this.notificationTimeout) {
                clearTimeout(this.notificationTimeout);
            }

            this.notificationTimeout = setTimeout(() => {
                notification.classList.remove('show');
                notification.classList.remove('success');
                notification.setAttribute('aria-hidden', 'true');
            }, 5000);
        }
    }

    showErrorNotification(message) {
        this.showNotification(message, 'error');
    }

    loadCollapsedStates() {
        const stored = localStorage.getItem('collapsedCategories');
        if (stored) {
            this.collapsedCategories = JSON.parse(stored);
        }
    }

    saveCollapsedStates() {
        localStorage.setItem('collapsedCategories', JSON.stringify(this.collapsedCategories));
    }

    async loadPageBookmarks(pageId) {
        try {
            const [bookmarksRes, categoriesRes] = await Promise.all([
                fetch(`/api/bookmarks?page=${pageId}`),
                fetch(`/api/categories?page=${pageId}`)
            ]);
            
            this.bookmarks = await bookmarksRes.json();
            this.categories = (await categoriesRes.json()).map(cat => ({ ...cat, name: this.language.t(cat.name) || cat.name }));
            this.currentPageId = pageId;
            
            // Update URL hash
            const pageIndex = this.pages.findIndex(p => p.id === pageId);
            if (pageIndex !== -1) {
                window.location.hash = `#${pageIndex + 1}`;
            }
            
            // Update page title
            const page = this.pages.find(p => p.id === pageId);
            if (page) {
                this.updatePageTitle(page.name);
            }
            
            // Update document title with page name if enabled
            this.updateDocumentTitle();

            // Update search component and render
            if (this.searchComponent) {
                this.updateSearchComponent();
            }
            this.renderDashboard();
            
            // Reset keyboard navigation to first element when changing pages
            if (this.keyboardNavigation) {
                this.keyboardNavigation.resetToFirst();
            }
        } catch (error) {
            this.showErrorNotification('Failed to load bookmarks for this page.');
        }
    }

    async loadAllBookmarks() {
        try {
            const allBookmarksRes = await fetch('/api/bookmarks?all=true');
            this.allBookmarks = await allBookmarksRes.json();
            
            // Update search component with all bookmarks
            if (this.searchComponent) {
                this.updateSearchComponent();
            }
        } catch (error) {
            this.showErrorNotification('Failed to refresh global shortcuts.');
        }
    }

    async saveSettings() {
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.settings)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save settings');
            }
            
            // Also save to localStorage if device-specific is enabled
            const deviceSpecific = localStorage.getItem('deviceSpecificSettings') === 'true';
            if (deviceSpecific) {
                localStorage.setItem('dashboardSettings', JSON.stringify(this.settings));
            }
        } catch (error) {
            this.showErrorNotification('Failed to save settings.');
        }
    }

    updatePageTitle(pageName) {
        const titleElement = document.querySelector('.title');
        if (titleElement) {
            titleElement.textContent = pageName || this.language.t('dashboard.defaultPageTitle');
        }
    }

    updateDocumentTitle() {
        let title = 'Dashboard';
        
        if (this.settings && this.settings.enableCustomTitle) {
            if (this.settings.customTitle && this.settings.customTitle.trim()) {
                title = this.settings.customTitle.trim();
                
                // Add page name if enabled
                if (this.settings.showPageInTitle && this.pages && this.currentPageId) {
                    const currentPage = this.pages.find(p => p.id === this.currentPageId);
                    if (currentPage && currentPage.name) {
                        title += ' | ' + currentPage.name;
                    }
                }
            } else {
                // Custom title is empty, show only page name if enabled
                if (this.settings.showPageInTitle && this.pages && this.currentPageId) {
                    const currentPage = this.pages.find(p => p.id === this.currentPageId);
                    if (currentPage && currentPage.name) {
                        title = currentPage.name;
                    }
                }
            }
        }
        
        document.title = title;
    }

    renderPageNavigation() {
        const container = document.getElementById('page-navigation');
        if (!container) return;

        container.innerHTML = '';

        this.pages.forEach((page, index) => {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'page-nav-btn';
            if (page.id === this.currentPageId) {
                pageBtn.classList.add('active');
            }
            // Show page number or name based on settings
            pageBtn.textContent = this.settings.showPageNamesInTabs ? page.name : (index + 1).toString();
            pageBtn.addEventListener('click', () => {
                // Update all buttons
                container.querySelectorAll('.page-nav-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                pageBtn.classList.add('active');
                
                // Load bookmarks for selected page
                this.loadPageBookmarks(page.id);
                // Update title
                this.updatePageTitle(page.name);
            });
            container.appendChild(pageBtn);
        });
    }

    setupDOM() {
        // Control date visibility and set up if visible
        this.updateDateVisibility();

        // Apply theme - use classList to preserve other classes
        document.body.classList.remove('dark', 'light');
        document.body.classList.add(this.settings.theme);
        document.body.setAttribute('data-theme', this.settings.theme);
        document.body.setAttribute('data-show-title', this.settings.showTitle);
        document.body.setAttribute('data-show-date', this.settings.showDate);
        document.body.setAttribute('data-show-config-button', this.settings.showConfigButton);
        document.body.setAttribute('data-show-cheatsheet-button', this.settings.showCheatSheetButton !== false);
        document.body.setAttribute('data-show-search-button', this.settings.showSearchButton);
        document.body.setAttribute('data-show-finders-button', this.settings.showFindersButton);
        document.body.setAttribute('data-show-commands-button', this.settings.showCommandsButton);
        document.body.setAttribute('data-show-search-button-text', this.settings.showSearchButtonText);
        document.body.setAttribute('data-show-finders-button-text', this.settings.showFindersButtonText);
        document.body.setAttribute('data-show-commands-button-text', this.settings.showCommandsButtonText);
        document.body.setAttribute('data-layout-preset', this.settings.layoutPreset || 'default');

        // Apply font size
        this.applyFontSize();

        // Apply background dots
        this.applyBackgroundDots();

        // Apply animations
        this.applyAnimations();

        // Control title visibility dynamically
        this.updateTitleVisibility();
        
        // Control config button visibility dynamically  
        this.updateConfigButtonVisibility();

        // Control page tabs visibility dynamically
        this.updatePageTabsVisibility();

        // Apply columns setting
        const grid = document.getElementById('dashboard-layout');
        if (grid) {
            grid.className = `dashboard-grid columns-${this.settings.columnsPerRow} layout-${this.settings.layoutPreset || 'default'}`;
        }
    }

    // Helper to find the header container used across different templates/layouts
    getHeaderContainer() {
        // Prefer an explicit .header if present, fall back to known header-top / header-actions
        const header = document.querySelector('.header') || document.querySelector('.header-top') || document.querySelector('.header-actions') || document.querySelector('.dashboard-section.section-controls .container');
        // Final fallback to body so insert/append operations don't throw
        return header || document.body;
    }

    initializeSearchComponent() {
        // Initialize search component with current data
        // Use all bookmarks if global shortcuts is enabled, otherwise just current page
        const bookmarksForSearch = this.settings.globalShortcuts ? this.allBookmarks : this.bookmarks;
        
        if (window.SearchComponent) {
            this.searchComponent = new window.SearchComponent(bookmarksForSearch, this.bookmarks, this.allBookmarks, this.settings, this.language, this.finders);
        } else {
            console.warn('SearchComponent not found. Make sure search.js is loaded.');
        }
    }

    // Method to update search component when data changes
    updateSearchComponent() {
        if (this.searchComponent) {
            // Use all bookmarks if global shortcuts is enabled, otherwise just current page
            const bookmarksForSearch = this.settings.globalShortcuts ? this.allBookmarks : this.bookmarks;
            this.searchComponent.updateData(bookmarksForSearch, this.bookmarks, this.allBookmarks, this.settings, this.language, this.finders);
        }
    }

    initializeStatusMonitor() {
        // Initialize status monitor with current settings
        if (window.StatusMonitor) {
            this.statusMonitor = new window.StatusMonitor(this.settings);
            // Make dashboard instance available globally for status monitor
            window.dashboardInstance = this;
        } else {
            console.warn('StatusMonitor not found. Make sure status.js is loaded.');
        }
    }

    initializeKeyboardNavigation() {
        // Initialize keyboard navigation component
        if (window.KeyboardNavigation) {
            this.keyboardNavigation = new window.KeyboardNavigation(this);
        } else {
            console.warn('KeyboardNavigation not found. Make sure keyboard-navigation.js is loaded.');
        }
    }

    initializeSwipeNavigation() {
        // Initialize swipe navigation component for touch gestures
        if (window.SwipeNavigation) {
            this.swipeNavigation = new window.SwipeNavigation(this);
        } else {
            console.warn('SwipeNavigation not found. Make sure swipe-navigation.js is loaded.');
        }
    }

    initializeHyprMode() {
        // Initialize HyprMode component
        if (window.hyprMode) {
            window.hyprMode.init(this.settings.hyprMode || false, this.language);
        } else {
            console.warn('HyprMode not found. Make sure hypr-mode.js is loaded.');
        }
    }

    // Method to update status monitor when settings change
    updateStatusMonitor() {
        if (this.statusMonitor) {
            this.statusMonitor.updateSettings(this.settings);
        }
    }

    setupPageShortcuts() {
        // Listen for number key presses to switch pages
        document.addEventListener('keydown', (e) => {
            // Only handle number keys 1-9
            // Ignore if user is typing in an input field or if search is active
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Check if shortcut search is active
            const searchElement = document.getElementById('shortcut-search');
            if (searchElement && searchElement.classList.contains('show')) {
                return;
            }

            if (this.isModalOpen()) {
                return;
            }
            
            // Don't trigger if Ctrl, Alt, or Meta are pressed (but allow Shift)
            if (e.ctrlKey || e.altKey || e.metaKey) {
                if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showKeyboardCheatSheet();
                }
                return;
            }

            if (e.key === 'F1') {
                e.preventDefault();
                e.stopPropagation();
                this.showKeyboardCheatSheet();
                return;
            }
            
            // Check if a number key (1-9) was pressed
            const key = e.key;
            if (key >= '1' && key <= '9') {
                const pageIndex = parseInt(key) - 1;
                
                // Check if this page exists
                if (pageIndex < this.pages.length) {
                    e.preventDefault(); // Prevent default browser behavior
                    e.stopPropagation(); // Stop the event from reaching other listeners
                    
                    const page = this.pages[pageIndex];
                    
                    // Update navigation buttons
                    const navButtons = document.querySelectorAll('.page-nav-btn');
                    navButtons.forEach(btn => btn.classList.remove('active'));
                    if (navButtons[pageIndex]) {
                        navButtons[pageIndex].classList.add('active');
                    }
                    
                    // Load the page
                    this.loadPageBookmarks(page.id);
                    this.updatePageTitle(page.name);
                }
            }
            
            // Handle Shift + Arrow keys for page navigation
            if (e.shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
                e.preventDefault();
                e.stopPropagation();
                
                // Find current page index
                const currentIndex = this.pages.findIndex(page => page.id === this.currentPageId);
                if (currentIndex === -1) return;
                
                let newIndex;
                if (key === 'ArrowLeft') {
                    // Previous page
                    newIndex = currentIndex > 0 ? currentIndex - 1 : this.pages.length - 1;
                } else {
                    // Next page
                    newIndex = currentIndex < this.pages.length - 1 ? currentIndex + 1 : 0;
                }
                
                const page = this.pages[newIndex];
                
                // Update navigation buttons
                const navButtons = document.querySelectorAll('.page-nav-btn');
                navButtons.forEach(btn => btn.classList.remove('active'));
                if (navButtons[newIndex]) {
                    navButtons[newIndex].classList.add('active');
                }
                
                // Load the page
                this.loadPageBookmarks(page.id);
                this.updatePageTitle(page.name);
            }
        });
    }

    setupReorderUndoShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !this.pendingReorderSnapshot) {
                return;
            }

            if (this.isModalOpen()) {
                return;
            }

            // Do not interfere with shortcut search behavior
            if (this.searchComponent && this.searchComponent.isActive()) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            this.undoPendingReorder();
        });
    }

    setupToolbarActions() {
        const helpButton = document.getElementById('help-button');
        if (helpButton) {
            helpButton.addEventListener('click', () => {
                this.showKeyboardCheatSheet();
            });
        }

        const recentButton = document.getElementById('recent-bookmarks-button');
        if (recentButton) {
            recentButton.addEventListener('click', () => {
                this.toggleRecentBookmarksModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            const isTypingContext = Boolean(
                e.target && (
                    e.target.tagName === 'INPUT' ||
                    e.target.tagName === 'TEXTAREA' ||
                    e.target.isContentEditable
                )
            );

            if (isTypingContext) {
                return;
            }

            if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyR') {
                e.preventDefault();
                this.toggleRecentBookmarksModal();
            }
        });
    }

    isModalOpen() {
        return Boolean(document.querySelector('.modal-overlay.show'));
    }

    showKeyboardCheatSheet() {
        if (!window.AppModal) {
            return;
        }

        const sections = this.getKeyboardCheatSheetItems();
        const html = `
            <div class="keyboard-cheat-sheet">
                <p class="keyboard-cheat-sheet-intro">Keyboard shortcuts for navigation, search, and quick actions.</p>
                <div class="keyboard-cheat-sheet-grid">
                    ${sections.map((section) => `
                        <section class="keyboard-cheat-sheet-panel">
                            <h3 class="keyboard-cheat-sheet-section-title">${section.title}</h3>
                            <div class="keyboard-cheat-sheet-list">
                                ${section.items.map((shortcut) => `
                                    <div class="keyboard-cheat-sheet-row">
                                        <span class="keyboard-cheat-sheet-keys">${shortcut.keys}</span>
                                        <span class="keyboard-cheat-sheet-description">${shortcut.description}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </section>
                    `).join('')}
                </div>
            </div>
        `;

        window.AppModal.show({
            title: 'Keyboard cheat sheet',
            htmlMessage: html,
            confirmText: 'Close',
            showCancel: false,
            modalClass: 'keyboard-cheat-sheet-modal',
            modalMaxWidth: '920px',
            modalWidth: '94vw'
        });
    }

    getKeyboardCheatSheetItems() {
        return [
            {
                title: 'Navigation',
                items: [
                    { keys: '1-9', description: 'Open the matching page tab' },
                    { keys: 'Shift + ← / →', description: 'Move between page tabs' },
                    { keys: '↑ / ↓', description: 'Move through bookmarks with keyboard focus' },
                    { keys: '← / →', description: 'Move horizontally through the bookmark grid' },
                    { keys: 'Enter / Space', description: 'Open the selected bookmark' },
                    { keys: 'Esc', description: 'Clear selection or undo the latest reorder' }
                ]
            },
            {
                title: 'Search',
                items: [
                    { keys: '>', description: 'Open search' },
                    { keys: ':', description: 'Open command mode' },
                    { keys: '?', description: 'Open finders' },
                    { keys: '!', description: 'Open keyboard cheat sheet' },
                    { keys: 'Ctrl + Shift + R', description: 'Open or close recent bookmarks' },
                    { keys: 'Ctrl + / or F1', description: 'Open keyboard cheat sheet' },
                    { keys: 'tag:, category:, status:, page:', description: 'Filter search results by metadata' }
                ]
            },
            {
                title: 'New Features',
                items: [
                    { keys: 'Ctrl + Shift + A', description: 'Open Quick Add bookmark widget' },
                    { keys: 'Hover bookmark', description: 'Load preview metadata on demand' },
                    { keys: 'Bookmarks tab', description: 'Analytics, duplicate warnings, and bulk actions' },
                    { keys: 'Theme / layout', description: 'Auto dark mode, opacity, font weight, presets' },
                    { keys: 'Alt + Up / Down', description: 'Move selected bookmark in config' }
                ]
            }
        ];
    }

    setupBookmarkTracking() {
        // Track when bookmarks are opened
        document.addEventListener('click', (e) => {
            const bookmarkLink = e.target.closest('a.bookmark-link, .bookmark');
            if (bookmarkLink && bookmarkLink.dataset.bookmarkIndex) {
                const index = parseInt(bookmarkLink.dataset.bookmarkIndex);
                this.analytics?.trackBookmarkOpen(this.currentPageId, index);
            }
        });
    }

    async buildSearchIndex() {
        try {
            await fetch('/api/search-index', { method: 'POST' });
        } catch (error) {
            // Keep dashboard functional if indexing fails
            console.warn('Search index build failed:', error);
        }
    }

    applyVisualSettings() {
        const opacity = Number(this.settings.backgroundOpacity ?? 1);
        const clampedOpacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
        document.documentElement.style.setProperty('--dashboard-bg-opacity', String(clampedOpacity));
        document.body.style.setProperty('opacity', String(Math.max(0.65, clampedOpacity)));

        const weight = this.settings.fontWeight || 'normal';
        document.body.style.setProperty('--dashboard-font-weight', weight);
        document.body.style.fontWeight = weight;
    }

    initializeAutoDarkMode() {
        const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        const applyPreferredTheme = () => {
            if (!this.settings.autoDarkMode || !media) {
                return;
            }
            const preferred = media.matches ? 'dark' : 'light';
            document.body.classList.remove('dark', 'light');
            document.body.classList.add(preferred);
            document.body.setAttribute('data-theme', preferred);
        };

        applyPreferredTheme();

        if (media && typeof media.addEventListener === 'function') {
            media.addEventListener('change', applyPreferredTheme);
        }
    }

    renderDashboard() {
        const container = document.getElementById('dashboard-layout');
        if (!container) return;

        // Group bookmarks by category
        const groupedBookmarks = this.groupBookmarksByCategory();
        
        // Clear container
        container.innerHTML = '';

        if (!Array.isArray(this.bookmarks) || this.bookmarks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">No bookmarks yet</div>
                    <div class="empty-state-subtext">Use quick add (Ctrl+Shift+A) or open config to add your first bookmark.</div>
                    <div class="empty-state-action">
                        <a class="btn btn-primary" href="/config#bookmarks">Add bookmarks</a>
                    </div>
                </div>
            `;
            this.updateSearchComponent();
            return;
        }

        // Render categories
        this.categories.forEach(category => {
            const categoryBookmarks = this.sortBookmarks(groupedBookmarks[category.id] || []);
            if (categoryBookmarks.length === 0) return;

            const categoryElement = this.createCategoryElement(category, categoryBookmarks);
            container.appendChild(categoryElement);
        });

        // Handle bookmarks without category
        const uncategorizedBookmarks = groupedBookmarks[''] || [];
        if (uncategorizedBookmarks.length > 0) {
            const uncategorizedCategory = { id: '', name: this.language.t('dashboard.uncategorized') };
            const categoryElement = this.createCategoryElement(uncategorizedCategory, this.sortBookmarks(uncategorizedBookmarks));
            container.appendChild(categoryElement);
        }

        // Enable realtime drag-and-drop sorting within each category
        this.initializeCategoryReorder();

        // Update search component with current data
        this.updateSearchComponent();
        
        // Initialize or update status monitoring after rendering
        if (this.statusMonitor) {
            // Check if this is the first time initializing or just updating bookmarks
            if (this.statusMonitorInitialized) {
                // Just update bookmarks without clearing cache
                this.statusMonitor.updateBookmarks(this.bookmarks);
            } else {
                // First time initialization
                this.statusMonitor.init(this.bookmarks);
                this.statusMonitorInitialized = true;
            }
        }
    }

    groupBookmarksByCategory() {
        const grouped = {};
        
        this.bookmarks.forEach(bookmark => {
            const categoryId = bookmark.category || '';
            if (!grouped[categoryId]) {
                grouped[categoryId] = [];
            }
            grouped[categoryId].push(bookmark);
        });

        // Bookmarks are kept in the order they appear in the JSON file
        // No sorting applied - respects the order from data/bookmarks-X.json

        return grouped;
    }

    sortBookmarks(bookmarks) {
        const sorted = [...(Array.isArray(bookmarks) ? bookmarks : [])];
        const method = this.settings.sortMethod || 'order';

        if (method === 'az') {
            return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }

        if (method === 'recent') {
            return sorted.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
        }

        if (method === 'custom') {
            return sorted.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
        }

        return sorted;
    }

    initializeCategoryReorder() {
        this.destroyCategoryReorderInstances();

        if (typeof DragReorder === 'undefined') {
            return;
        }

        const categoryLists = document.querySelectorAll('.bookmarks-list[data-category-id]');
        categoryLists.forEach((listElement) => {
            const categoryId = listElement.getAttribute('data-category-id') || '';

            const reorderInstance = new DragReorder({
                container: listElement,
                itemSelector: '.bookmark-link',
                handleSelector: '.bookmark-drag-handle',
                onReorder: () => {
                    this.syncBookmarksFromDom();
                }
            });

            this.categoryReorderInstances.push(reorderInstance);
        });
    }

    destroyCategoryReorderInstances() {
        if (!Array.isArray(this.categoryReorderInstances)) {
            this.categoryReorderInstances = [];
            return;
        }

        this.categoryReorderInstances.forEach((instance) => {
            if (instance && typeof instance.destroy === 'function') {
                instance.destroy();
            }
        });
        this.categoryReorderInstances = [];
    }

    syncBookmarksFromDom() {
        const previousBookmarks = this.bookmarks.map((bookmark) => ({ ...bookmark }));
        const nextBookmarks = [];
        let bookmarkCursor = 0;

        const categoryLists = document.querySelectorAll('.bookmarks-list[data-category-id]');
        categoryLists.forEach((listElement) => {
            const categoryId = listElement.getAttribute('data-category-id') || '';
            const listBookmarks = listElement.querySelectorAll('.bookmark-link[data-bookmark-index]');

            listBookmarks.forEach((bookmarkElement) => {
                const oldBookmarkIndex = parseInt(bookmarkElement.getAttribute('data-bookmark-index'), 10);
                if (Number.isNaN(oldBookmarkIndex) || !previousBookmarks[oldBookmarkIndex]) {
                    return;
                }

                const bookmark = previousBookmarks[oldBookmarkIndex];
                nextBookmarks.push({ ...bookmark, category: categoryId });
                bookmarkElement.setAttribute('data-bookmark-index', String(bookmarkCursor));
                bookmarkCursor += 1;
            });
        });

        if (nextBookmarks.length === 0 || nextBookmarks.length !== previousBookmarks.length) {
            return;
        }

        if (!this.pendingReorderSnapshot) {
            this.pendingReorderSnapshot = previousBookmarks.map((bookmark) => ({ ...bookmark }));
        }

        this.bookmarks = nextBookmarks;
        this.updateSearchComponent();
        if (this.statusMonitor) {
            this.statusMonitor.updateBookmarks(this.bookmarks);
        }
        this.scheduleBookmarkOrderSave();
    }

    scheduleBookmarkOrderSave() {
        if (this.pendingReorderSave) {
            clearTimeout(this.pendingReorderSave);
        }

        this.pendingReorderSave = setTimeout(() => {
            this.saveBookmarkOrder();
        }, 1000);
    }

    async saveBookmarkOrder() {
        const payload = [...this.bookmarks];

        try {
            const response = await fetch(`/api/bookmarks?page=${this.currentPageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Failed to save bookmark order');
            }

            // Keep global shortcut index updated when enabled
            if (this.settings.globalShortcuts) {
                await this.loadAllBookmarks();
            }

            this.pendingReorderSave = null;
            this.pendingReorderSnapshot = null;
            this.showNotification('Bookmark order saved.', 'success');
        } catch (error) {
            if (this.pendingReorderSnapshot) {
                this.bookmarks = [...this.pendingReorderSnapshot];
                this.renderDashboard();
            }
            this.pendingReorderSave = null;
            this.pendingReorderSnapshot = null;
            this.showErrorNotification('Failed to save bookmark order. Changes were reverted.');
        }
    }

    undoPendingReorder() {
        if (!this.pendingReorderSnapshot) {
            return;
        }

        if (this.pendingReorderSave) {
            clearTimeout(this.pendingReorderSave);
            this.pendingReorderSave = null;
        }

        this.bookmarks = [...this.pendingReorderSnapshot];
        this.pendingReorderSnapshot = null;
        this.renderDashboard();
    }

    createCategoryElement(category, bookmarks) {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';
        categoryDiv.setAttribute('data-category-id', category.id || '');
        const isCollapsed = this.settings.alwaysCollapseCategories ? true : (this.collapsedCategories[category.id] || false);
        categoryDiv.setAttribute('data-collapsed', isCollapsed ? 'true' : 'false');

        // Category title
        const titleElement = document.createElement('h2');
        titleElement.className = 'category-title';
        const categoryIcon = category.icon || '▣';
        titleElement.textContent = `${categoryIcon} ${category.name.toLowerCase()}`;
        titleElement.addEventListener('click', () => {
            const isCollapsed = categoryDiv.getAttribute('data-collapsed') === 'true';
            categoryDiv.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
            this.collapsedCategories[category.id] = !isCollapsed;
            this.saveCollapsedStates();
        });
        categoryDiv.appendChild(titleElement);

        // Bookmarks list
        const bookmarksList = document.createElement('div');
        bookmarksList.className = 'bookmarks-list';
        bookmarksList.setAttribute('data-category-id', category.id || '');
        bookmarksList.setAttribute('data-bookmarks-list', 'true');

        bookmarks.forEach(bookmark => {
            const bookmarkElement = this.createBookmarkElement(bookmark, category.id || '');
            bookmarksList.appendChild(bookmarkElement);
        });

        categoryDiv.appendChild(bookmarksList);
        return categoryDiv;
    }

    createBookmarkElement(bookmark, categoryId) {
        const link = document.createElement('a');
        link.href = bookmark.url;
        link.className = 'bookmark-link';
        link.setAttribute('data-bookmark-url', bookmark.url);
        link.setAttribute('data-bookmark-index', String(this.bookmarks.indexOf(bookmark)));
        link.setAttribute('data-category-id', categoryId);

        // Bookmark link itself should remain clickable; drag happens from the handle
        link.draggable = false;

        const dragHandle = document.createElement('span');
        dragHandle.className = 'bookmark-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.setAttribute('title', 'Drag to reorder');
        dragHandle.setAttribute('aria-hidden', 'true');
        dragHandle.addEventListener('click', (e) => {
            // Prevent accidental navigation when pressing the handle
            e.preventDefault();
        });
        link.appendChild(dragHandle);
        
        // Add icon if exists and showIcons is enabled
        if (bookmark.icon && this.settings.showIcons) {
            const placeholder = document.createElement('span');
            placeholder.className = 'icon-placeholder';
            link.appendChild(placeholder);

            const iconImg = document.createElement('img');
            iconImg.src = `/data/icons/${bookmark.icon}`;
            iconImg.className = 'bookmark-icon';
            iconImg.alt = '';
            iconImg.loading = 'lazy';
            iconImg.addEventListener('load', () => {
                placeholder.remove();
            });
            iconImg.addEventListener('error', () => {
                placeholder.remove();
            });
            link.appendChild(iconImg);
        }
        
        // Create text wrapper for ellipsis
        const textSpan = document.createElement('span');
        textSpan.className = 'bookmark-text';
        textSpan.textContent = bookmark.name;
        link.appendChild(textSpan);
        
        // Always add click handler to check HyprMode dynamically
        link.addEventListener('click', (e) => {
            this.recordBookmarkOpened(bookmark);
            // Check if HyprMode is enabled at click time
            if (window.hyprMode && window.hyprMode.isEnabled()) {
                e.preventDefault();
                window.hyprMode.handleBookmarkClick(bookmark.url);
            }
            // If HyprMode is not enabled, let the default behavior happen
            // (which will be controlled by target="_blank" if openInNewTab is true)
        });
        
        // Set target for new tab if openInNewTab is enabled and HyprMode is not
        if (this.settings.openInNewTab) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }

        // Add shortcut indicator if exists
        if (bookmark.shortcut && bookmark.shortcut.trim()) {
            const shortcutSpan = document.createElement('span');
            shortcutSpan.className = 'bookmark-shortcut';
            shortcutSpan.textContent = bookmark.shortcut.toUpperCase();
            link.appendChild(shortcutSpan);
        }

        if (bookmark.previewTitle || bookmark.previewDesc) {
            link.title = `${bookmark.previewTitle || bookmark.name}${bookmark.previewDesc ? `\n${bookmark.previewDesc}` : ''}`;
        } else {
            link.addEventListener('mouseenter', async () => {
                if (link.dataset.previewLoaded === 'true') {
                    return;
                }
                try {
                    const response = await fetch(`/api/bookmark-preview?url=${encodeURIComponent(bookmark.url)}`);
                    if (!response.ok) {
                        return;
                    }
                    const preview = await response.json();
                    const title = preview.title || bookmark.name;
                    const description = preview.description || '';
                    link.title = `${title}${description ? `\n${description}` : ''}`;
                    link.dataset.previewLoaded = 'true';
                } catch (error) {
                    link.dataset.previewLoaded = 'true';
                }
            }, { once: true });
        }

        return link;
    }

    createRecentBookmarkElement(bookmark) {
        const link = document.createElement('a');
        link.href = bookmark.url;
        link.className = 'bookmark-link recent-bookmark-link';

        const textWrapper = document.createElement('span');
        textWrapper.className = 'bookmark-text recent-bookmark-text';
        textWrapper.textContent = bookmark.name;
        link.appendChild(textWrapper);

        const meta = document.createElement('span');
        meta.className = 'bookmark-shortcut recent-bookmark-meta';
        meta.textContent = bookmark.category || 'No category';
        link.appendChild(meta);

        if (this.settings.openInNewTab) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }

        link.addEventListener('click', () => {
            this.recordBookmarkOpened(bookmark);
        });

        return link;
    }

    isRecentBookmarksModalOpen() {
        const overlay = document.getElementById('app-modal');
        const panel = overlay ? overlay.querySelector('.modal') : null;
        return Boolean(
            overlay &&
            panel &&
            overlay.classList.contains('show') &&
            panel.classList.contains('recent-bookmarks-modal')
        );
    }

    toggleRecentBookmarksModal() {
        if (!window.AppModal) {
            return;
        }

        if (this.isModalOpen() && !this.isRecentBookmarksModalOpen()) {
            return;
        }

        if (this.isRecentBookmarksModalOpen()) {
            window.AppModal.hide();
            return;
        }

        const recentBookmarks = this.getRecentBookmarks(this.bookmarks);
        const openInNewTab = this.settings.openInNewTab;
        const noRecentText = this.language.t('dashboard.noRecentBookmarks') || 'No recent bookmarks yet.';
        const modalHtml = recentBookmarks.length > 0
            ? `
                <div class="recent-bookmarks-modal-list">
                    ${recentBookmarks.map((bookmark, index) => {
                        const safeName = this.escapeHtml(bookmark.name || 'Bookmark');
                        const safeUrl = this.escapeHtml(bookmark.url || '#');
                        const safeCategory = this.escapeHtml(bookmark.category || (this.language.t('dashboard.uncategorized') || 'Other'));
                        const target = openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
                        return `
                            <a class="recent-bookmarks-modal-item" href="${safeUrl}" data-recent-index="${index}"${target}>
                                <span class="recent-bookmarks-modal-name">${safeName}</span>
                                <span class="recent-bookmarks-modal-meta">${safeCategory}</span>
                            </a>
                        `;
                    }).join('')}
                </div>
            `
            : `<div class="recent-bookmarks-empty">${this.escapeHtml(noRecentText)}</div>`;

        window.AppModal.show({
            title: this.language.t('dashboard.recentBookmarksTitle') || 'Recent bookmarks',
            htmlMessage: modalHtml,
            confirmText: this.language.t('dashboard.close') || 'Close',
            showCancel: false,
            modalClass: 'recent-bookmarks-modal',
            modalMaxWidth: '760px',
            modalWidth: '92vw'
        });

        if (recentBookmarks.length > 0) {
            const items = document.querySelectorAll('.recent-bookmarks-modal-item[data-recent-index]');
            items.forEach((item) => {
                item.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.getAttribute('data-recent-index'), 10);
                    if (!Number.isNaN(index) && recentBookmarks[index]) {
                        this.recordBookmarkOpened(recentBookmarks[index]);
                    }
                });
            });
        }
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getRecentBookmarks(bookmarks) {
        return [...(Array.isArray(bookmarks) ? bookmarks : [])]
            .filter((bookmark) => bookmark && bookmark.lastOpened)
            .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
            .slice(0, 10);
    }

    recordBookmarkOpened(bookmark) {
        if (!bookmark) return;

        bookmark.lastOpened = Date.now();

        if (this.pendingMetadataSave) {
            clearTimeout(this.pendingMetadataSave);
        }

        this.pendingMetadataSave = setTimeout(() => {
            this.pendingMetadataSave = null;
            fetch(`/api/bookmarks?page=${this.currentPageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.bookmarks)
            }).catch((error) => {
                console.error('Failed to save bookmark metadata:', error);
            });
        }, 1000);
    }

    updateTitleVisibility() {
        // Update the data attribute for CSS visibility control
        document.body.setAttribute('data-show-title', this.settings.showTitle);
        
        // Update the title text if showing
        const titleElement = document.querySelector('.title');
        if (titleElement && this.settings.showTitle) {
            const currentPage = this.pages.find(p => p.id === this.currentPageId);
            titleElement.textContent = currentPage ? currentPage.name : this.language.t('dashboard.defaultPageTitle');
        }
    }

    applyFontSize() {
        // Remove existing font size classes
        document.body.classList.remove('font-size-xs', 'font-size-s', 'font-size-sm', 'font-size-m', 'font-size-lg', 'font-size-l', 'font-size-xl');
        document.body.classList.remove('font-size-small', 'font-size-medium', 'font-size-large'); // Remove old classes
        
        // Migrate old values to new values
        let fontSize = this.settings.fontSize || 'm';
        if (fontSize === 'small') fontSize = 'sm';
        if (fontSize === 'medium') fontSize = 'm';
        if (fontSize === 'large') fontSize = 'l';
        
        // Update settings if migration occurred
        if (this.settings.fontSize !== fontSize) {
            this.settings.fontSize = fontSize;
            this.saveSettings();
        }
        
        // Add current font size class
        document.body.classList.add(`font-size-${fontSize}`);
    }

    applyBackgroundDots() {
        // Toggle background dots class
        if (this.settings.showBackgroundDots !== false) {
            document.body.classList.remove('no-background-dots');
        } else {
            document.body.classList.add('no-background-dots');
        }
    }

    applyAnimations() {
        // Toggle animations class
        if (this.settings.animationsEnabled !== false) {
            document.body.classList.remove('no-animations');
        } else {
            document.body.classList.add('no-animations');
        }
    }

    updateConfigButtonVisibility() {
        let configLink = document.querySelector('.config-link');

        if (this.settings.showConfigButton) {
            // Show config button - create if it doesn't exist
            if (!configLink) {
                configLink = document.createElement('div');
                configLink.className = 'config-link';
                configLink.innerHTML = `<a href="/config">${this.language.t('dashboard.config')}</a>`;

                // Add to header at the end (use safe header container)
                const header = this.getHeaderContainer();
                header.appendChild(configLink);
            }
        } else {
            // Hide config button - remove if it exists
            if (configLink) {
                configLink.remove();
            }
        }
    }

    updatePageTabsVisibility() {
        const pageNavigation = document.getElementById('page-navigation');
        if (pageNavigation) {
            pageNavigation.style.display = this.settings.showPageTabs ? 'block' : 'none';
        }
    }

    updateDateVisibility() {
        let dateElement = document.getElementById('date-element');
        
        if (this.settings.showDate) {
            // Show date - create if it doesn't exist
            if (!dateElement) {
                dateElement = document.createElement('div');
                dateElement.id = 'date-element';
                dateElement.className = 'date';
                
                // Insert at the beginning of header (use safe header container)
                const header = this.getHeaderContainer();
                if (header.firstChild) {
                    header.insertBefore(dateElement, header.firstChild);
                } else {
                    header.appendChild(dateElement);
                }
            }
            
            // Set date content
            const today = new Date();
            const lang = this.settings.language;
            const month = today.toLocaleString(lang, { month: 'short' });
            const day = String(today.getDate()).padStart(2, '0');
            const year = today.getFullYear();
            dateElement.textContent = `${day}/${month}/${year}`;
        } else {
            // Hide date - remove if it exists
            if (dateElement) {
                dateElement.remove();
            }
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});
