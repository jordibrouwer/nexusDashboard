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
            showRecentButton: true,
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
            autoDarkMode: false,
            showSmartRecentCollection: false,
            showSmartStaleCollection: false,
            showSmartMostUsedCollection: false,
            smartRecentLimit: 50,
            smartMostUsedLimit: 25,
            smartRecentPageIds: [],
            smartStalePageIds: [],
            smartMostUsedPageIds: []
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
        this.inlineEditingBookmarkIndex = null;
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

            if (!Array.isArray(this.settings.smartRecentPageIds)) {
                this.settings.smartRecentPageIds = [];
            }
            if (!Array.isArray(this.settings.smartStalePageIds)) {
                this.settings.smartStalePageIds = [];
            }
            if (!Array.isArray(this.settings.smartMostUsedPageIds)) {
                this.settings.smartMostUsedPageIds = [];
            }
            if (typeof this.settings.showSmartRecentCollection === 'undefined') {
                this.settings.showSmartRecentCollection = false;
            }
            if (typeof this.settings.showSmartStaleCollection === 'undefined') {
                this.settings.showSmartStaleCollection = false;
            }
            if (typeof this.settings.showSmartMostUsedCollection === 'undefined') {
                this.settings.showSmartMostUsedCollection = false;
            }
            if (typeof this.settings.showRecentButton === 'undefined') {
                this.settings.showRecentButton = true;
            }
            if (!Number.isFinite(Number(this.settings.smartRecentLimit)) || Number(this.settings.smartRecentLimit) < 0) {
                this.settings.smartRecentLimit = 50;
            } else {
                this.settings.smartRecentLimit = Number(this.settings.smartRecentLimit);
            }
            if (!Number.isFinite(Number(this.settings.smartMostUsedLimit)) || Number(this.settings.smartMostUsedLimit) < 0) {
                this.settings.smartMostUsedLimit = 25;
            } else {
                this.settings.smartMostUsedLimit = Number(this.settings.smartMostUsedLimit);
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
            
            // Always load all bookmarks so smart collections can work across pages.
            await this.loadAllBookmarks();
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
        document.body.setAttribute('data-show-recent-button', this.settings.showRecentButton !== false);
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

            if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key === '*') {
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
                    { keys: 'E', description: 'Inline-edit the selected bookmark (when edit control is shown)' },
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
                    { keys: '*', description: 'Open or close recent bookmarks' },
                    { keys: 'Ctrl + / or F1', description: 'Open keyboard cheat sheet' },
                    { keys: 'category:, status:, page:', description: 'Filter search results by metadata' }
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
            if (e.target.closest('.bookmark-inline-edit-btn') || e.target.closest('.bookmark-inline-form')) {
                return;
            }
            const openLink = e.target.closest('a.bookmark-open');
            if (!openLink) {
                return;
            }
            const bookmarkRow = openLink.closest('.bookmark-link[data-bookmark-index]');
            if (bookmarkRow && bookmarkRow.dataset.bookmarkIndex !== undefined) {
                const index = parseInt(bookmarkRow.dataset.bookmarkIndex, 10);
                if (!Number.isNaN(index) && index >= 0) {
                    this.analytics?.trackBookmarkOpen(this.currentPageId, index);
                }
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

        // Render smart collections first for quick access to derived sets.
        const smartCollections = this.getSmartCollections(this.getSmartCollectionSourceBookmarks());
        smartCollections.forEach((collection) => {
            if (!Array.isArray(collection.bookmarks) || collection.bookmarks.length === 0) {
                return;
            }
            const collectionBookmarks = collection.id === '__smart_recent__'
                ? [...collection.bookmarks].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
                : collection.id === '__smart_most_used__'
                    ? [...collection.bookmarks].sort((a, b) => Number(b.openCount || 0) - Number(a.openCount || 0))
                    : this.sortBookmarks(collection.bookmarks);
            const collectionElement = this.createCategoryElement({
                id: collection.id,
                name: collection.name,
                icon: collection.icon,
                isSmartCollection: true
            }, collectionBookmarks);
            container.appendChild(collectionElement);
        });

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
            if (listElement.getAttribute('data-smart-collection') === 'true') {
                return;
            }
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
        const movedElements = [];
        let bookmarkCursor = 0;

        const categoryLists = document.querySelectorAll('.bookmarks-list[data-category-id]');
        categoryLists.forEach((listElement) => {
            if (listElement.getAttribute('data-smart-collection') === 'true') {
                return;
            }
            const categoryId = listElement.getAttribute('data-category-id') || '';
            const listBookmarks = listElement.querySelectorAll('.bookmark-link[data-bookmark-index]');

            listBookmarks.forEach((bookmarkElement) => {
                const oldBookmarkIndex = parseInt(bookmarkElement.getAttribute('data-bookmark-index'), 10);
                if (Number.isNaN(oldBookmarkIndex) || !previousBookmarks[oldBookmarkIndex]) {
                    return;
                }

                const bookmark = previousBookmarks[oldBookmarkIndex];
                const movedAcrossCategories = (bookmark.category || '') !== categoryId;
                nextBookmarks.push({ ...bookmark, category: categoryId });
                bookmarkElement.setAttribute('data-bookmark-index', String(bookmarkCursor));
                bookmarkElement.setAttribute('data-category-id', categoryId);
                if (movedAcrossCategories) {
                    movedElements.push(bookmarkElement);
                }
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
        movedElements.forEach((element) => {
            element.classList.add('bookmark-move-in');
            setTimeout(() => element.classList.remove('bookmark-move-in'), 180);
        });
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
        const isSmartCollection = category.isSmartCollection === true;
        const isCollapsed = isSmartCollection
            ? false
            : (this.settings.alwaysCollapseCategories ? true : (this.collapsedCategories[category.id] || false));
        categoryDiv.setAttribute('data-collapsed', isCollapsed ? 'true' : 'false');

        // Category title
        const titleElement = document.createElement('h2');
        titleElement.className = 'category-title';
        const categoryIcon = (category.icon || '').trim();
        titleElement.innerHTML = '';

        if (this.isUploadedCategoryIcon(categoryIcon)) {
            const iconImage = document.createElement('img');
            iconImage.src = `/data/icons/${categoryIcon}`;
            iconImage.alt = '';
            iconImage.className = 'bookmark-icon';
            titleElement.appendChild(iconImage);
            titleElement.appendChild(document.createTextNode(` ${category.name.toLowerCase()}`));
        } else {
            const textIcon = categoryIcon || '▣';
            titleElement.textContent = `${textIcon} ${category.name.toLowerCase()}`;
        }
        titleElement.addEventListener('click', () => {
            if (isSmartCollection) {
                return;
            }
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
        if (isSmartCollection) {
            bookmarksList.setAttribute('data-smart-collection', 'true');
        }

        bookmarks.forEach(bookmark => {
            const bookmarkElement = this.createBookmarkElement(bookmark, category.id || '', !isSmartCollection);
            bookmarksList.appendChild(bookmarkElement);
        });

        categoryDiv.appendChild(bookmarksList);
        return categoryDiv;
    }

    isUploadedCategoryIcon(iconValue) {
        return typeof iconValue === 'string' && /\.[a-z0-9]+$/i.test(iconValue);
    }

    getSmartCollections(bookmarks) {
        const now = Date.now();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        const staleWindowMs = 30 * 24 * 60 * 60 * 1000;
        const normalized = Array.isArray(bookmarks) ? bookmarks : [];
        const currentPageId = Number(this.currentPageId);

        const currentPageIndex = this.pages.findIndex((page) => page.id === this.currentPageId);
        const currentPageNumber = currentPageIndex >= 0 ? (currentPageIndex + 1) : null;

        const pageAllowed = (pageIds) => {
            if (!Array.isArray(pageIds) || pageIds.length === 0) {
                return true;
            }
            const normalizedIds = pageIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0);
            if (normalizedIds.includes(currentPageId)) {
                return true;
            }
            if (currentPageNumber !== null && normalizedIds.includes(currentPageNumber)) {
                return true;
            }
            return false;
        };

        const recentBookmarks = normalized.filter((bookmark) => {
            const lastOpened = Number(bookmark.lastOpened || 0);
            return lastOpened > 0 && (now - lastOpened) <= oneWeekMs;
        });

        const staleBookmarks = normalized.filter((bookmark) => {
            const lastOpened = Number(bookmark.lastOpened || 0);
            return lastOpened === 0 || (now - lastOpened) > staleWindowMs;
        });
        const mostUsedBookmarks = normalized
            .filter((bookmark) => Number(bookmark.openCount || 0) > 0)
            .sort((a, b) => Number(b.openCount || 0) - Number(a.openCount || 0));

        const collections = [];

        if (this.settings.showSmartRecentCollection !== false && pageAllowed(this.settings.smartRecentPageIds)) {
            const configuredLimit = Number(this.settings.smartRecentLimit ?? 50);
            const effectiveLimit = Number.isFinite(configuredLimit) && configuredLimit > 0
                ? configuredLimit
                : null;
            collections.push({
                id: '__smart_recent__',
                name: 'Smart: Recently opened',
                icon: '⚡',
                bookmarks: effectiveLimit ? recentBookmarks.slice(0, effectiveLimit) : recentBookmarks
            });
        }

        if (this.settings.showSmartStaleCollection !== false && pageAllowed(this.settings.smartStalePageIds)) {
            collections.push({
                id: '__smart_stale__',
                name: 'Smart: Stale bookmarks',
                icon: '⌛',
                bookmarks: staleBookmarks
            });
        }

        if (this.settings.showSmartMostUsedCollection === true && pageAllowed(this.settings.smartMostUsedPageIds)) {
            const configuredLimit = Number(this.settings.smartMostUsedLimit ?? 25);
            const effectiveLimit = Number.isFinite(configuredLimit) && configuredLimit > 0
                ? configuredLimit
                : null;
            collections.push({
                id: '__smart_most_used__',
                name: 'Smart: Most used',
                icon: '📈',
                bookmarks: effectiveLimit ? mostUsedBookmarks.slice(0, effectiveLimit) : mostUsedBookmarks
            });
        }

        return collections;
    }

    getSmartCollectionSourceBookmarks() {
        if (Array.isArray(this.allBookmarks) && this.allBookmarks.length > 0) {
            return this.allBookmarks;
        }
        return this.bookmarks;
    }

    ensureBookmarkMutationSnapshot() {
        if (!this.pendingReorderSnapshot) {
            this.pendingReorderSnapshot = this.bookmarks.map((bm) => ({ ...bm }));
        }
    }

    tryOpenInlineBookmarkEdit() {
        const kn = this.keyboardNavigation;
        if (!kn || kn.currentIndex < 0 || !Array.isArray(kn.navigableElements)) {
            return;
        }
        const el = kn.navigableElements[kn.currentIndex];
        if (!el || el.classList.contains('bookmark-inline-editing')) {
            return;
        }
        const btn = el.querySelector('.bookmark-inline-edit-btn');
        if (btn) {
            btn.click();
        }
    }

    resolveBookmarkIndex(bookmark) {
        let idx = this.bookmarks.indexOf(bookmark);
        if (idx === -1 && bookmark && bookmark.url) {
            const u = (bookmark.url || '').trim();
            idx = this.bookmarks.findIndex((b) => (b.url || '').trim() === u);
        }
        return idx;
    }

    populateBookmarkRowView(row, bookmark, categoryId, allowInlineEdit) {
        const bookmarkIndex = this.resolveBookmarkIndex(bookmark);
        row.classList.remove('bookmark-inline-editing');
        row.innerHTML = '';
        row.className = 'bookmark-link';
        row.setAttribute('data-bookmark-url', bookmark.url || '');
        if (bookmarkIndex >= 0) {
            row.setAttribute('data-bookmark-index', String(bookmarkIndex));
        } else {
            row.removeAttribute('data-bookmark-index');
        }
        row.setAttribute('data-category-id', categoryId);

        const dragHandle = document.createElement('span');
        dragHandle.className = 'bookmark-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.setAttribute('title', 'Drag to reorder');
        dragHandle.setAttribute('aria-hidden', 'true');
        dragHandle.addEventListener('click', (e) => {
            e.preventDefault();
        });
        row.appendChild(dragHandle);

        if (bookmark.icon && this.settings.showIcons) {
            const placeholder = document.createElement('span');
            placeholder.className = 'icon-placeholder';
            row.appendChild(placeholder);

            const iconImg = document.createElement('img');
            iconImg.src = `/data/icons/${bookmark.icon}`;
            iconImg.className = 'bookmark-icon';
            iconImg.alt = '';
            iconImg.loading = 'lazy';
            iconImg.addEventListener('load', () => placeholder.remove());
            iconImg.addEventListener('error', () => placeholder.remove());
            row.appendChild(iconImg);
        }

        const openLink = document.createElement('a');
        openLink.className = 'bookmark-open';
        openLink.href = bookmark.url || '#';
        const textSpan = document.createElement('span');
        textSpan.className = 'bookmark-text';
        textSpan.textContent = bookmark.name || '';
        openLink.appendChild(textSpan);

        openLink.addEventListener('click', (e) => {
            this.recordBookmarkOpened(bookmark);
            if (window.hyprMode && window.hyprMode.isEnabled()) {
                e.preventDefault();
                window.hyprMode.handleBookmarkClick(bookmark.url);
            }
        });

        if (this.settings.openInNewTab) {
            openLink.target = '_blank';
            openLink.rel = 'noopener noreferrer';
        }

        if (bookmark.previewTitle || bookmark.previewDesc) {
            openLink.title = `${bookmark.previewTitle || bookmark.name}${bookmark.previewDesc ? `\n${bookmark.previewDesc}` : ''}`;
        } else {
            openLink.addEventListener('mouseenter', async () => {
                if (openLink.dataset.previewLoaded === 'true') {
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
                    openLink.title = `${title}${description ? `\n${description}` : ''}`;
                    openLink.dataset.previewLoaded = 'true';
                } catch (error) {
                    openLink.dataset.previewLoaded = 'true';
                }
            }, { once: true });
        }

        row.appendChild(openLink);

        if (bookmark.shortcut && String(bookmark.shortcut).trim()) {
            const shortcutSpan = document.createElement('span');
            shortcutSpan.className = 'bookmark-shortcut';
            shortcutSpan.textContent = String(bookmark.shortcut).toUpperCase();
            row.appendChild(shortcutSpan);
        }

        if (bookmark.pinned) {
            const pinBadge = document.createElement('span');
            pinBadge.className = 'bookmark-pin-badge';
            pinBadge.textContent = 'pin';
            pinBadge.title = 'Pinned';
            row.appendChild(pinBadge);
        }

        if (allowInlineEdit && bookmarkIndex >= 0) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'bookmark-inline-edit-btn';
            editBtn.setAttribute('aria-label', 'Edit bookmark');
            editBtn.title = 'Edit';
            editBtn.textContent = '✎';
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openBookmarkInlineEditor(row, bookmarkIndex);
            });
            row.appendChild(editBtn);
        }
    }

    openBookmarkInlineEditor(row, bookmarkIndex) {
        if (row.closest('[data-smart-collection="true"]')) {
            return;
        }
        if (!Number.isFinite(bookmarkIndex) || bookmarkIndex < 0) {
            return;
        }
        const bookmark = this.bookmarks[bookmarkIndex];
        if (!bookmark) {
            return;
        }

        this.inlineEditingBookmarkIndex = bookmarkIndex;
        row.classList.add('bookmark-inline-editing');
        row.innerHTML = '';

        const form = document.createElement('div');
        form.className = 'bookmark-inline-form';

        const mkField = (labelText, inputEl) => {
            const wrap = document.createElement('div');
            wrap.className = 'bookmark-inline-field';
            const lab = document.createElement('label');
            lab.className = 'bookmark-inline-label';
            lab.textContent = labelText;
            wrap.appendChild(lab);
            wrap.appendChild(inputEl);
            return wrap;
        };

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'bookmark-inline-input';
        nameInput.value = bookmark.name || '';
        form.appendChild(mkField('Name', nameInput));

        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.className = 'bookmark-inline-input';
        urlInput.value = bookmark.url || '';
        form.appendChild(mkField('URL', urlInput));

        const shortcutInput = document.createElement('input');
        shortcutInput.type = 'text';
        shortcutInput.className = 'bookmark-inline-input';
        shortcutInput.maxLength = 5;
        shortcutInput.value = (bookmark.shortcut || '').toUpperCase();
        shortcutInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        });
        form.appendChild(mkField('Shortcut', shortcutInput));

        const catSelect = document.createElement('select');
        catSelect.className = 'bookmark-inline-select';
        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '—';
        catSelect.appendChild(optEmpty);
        (this.categories || []).forEach((cat) => {
            const o = document.createElement('option');
            o.value = cat.id || '';
            o.textContent = cat.name || cat.id || '';
            if ((bookmark.category || '') === (cat.id || '')) {
                o.selected = true;
            }
            catSelect.appendChild(o);
        });
        form.appendChild(mkField('Category', catSelect));

        const pinInput = document.createElement('input');
        pinInput.type = 'checkbox';
        pinInput.id = `bookmark-inline-pin-${bookmarkIndex}`;
        pinInput.checked = Boolean(bookmark.pinned);
        const pinWrap = document.createElement('div');
        pinWrap.className = 'bookmark-inline-field bookmark-inline-check';
        const pinLabel = document.createElement('label');
        pinLabel.htmlFor = pinInput.id;
        pinLabel.textContent = 'Pinned';
        pinWrap.appendChild(pinInput);
        pinWrap.appendChild(pinLabel);
        form.appendChild(pinWrap);

        const statusInput = document.createElement('input');
        statusInput.type = 'checkbox';
        statusInput.id = `bookmark-inline-status-${bookmarkIndex}`;
        statusInput.checked = Boolean(bookmark.checkStatus);
        const statusWrap = document.createElement('div');
        statusWrap.className = 'bookmark-inline-field bookmark-inline-check';
        const statusLabel = document.createElement('label');
        statusLabel.htmlFor = statusInput.id;
        statusLabel.textContent = 'Check status';
        statusWrap.appendChild(statusInput);
        statusWrap.appendChild(statusLabel);
        form.appendChild(statusWrap);

        const actions = document.createElement('div');
        actions.className = 'bookmark-inline-actions';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'bookmark-inline-action-btn bookmark-inline-save';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.commitBookmarkInlineEdit(bookmarkIndex, {
                nameInput,
                urlInput,
                shortcutInput,
                catSelect,
                pinInput,
                statusInput
            });
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'bookmark-inline-action-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.cancelBookmarkInlineEdit(row, bookmarkIndex);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'bookmark-inline-action-btn bookmark-inline-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.deleteBookmarkAtIndexInline(bookmarkIndex);
        });

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        actions.appendChild(deleteBtn);
        form.appendChild(actions);

        form.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelBookmarkInlineEdit(row, bookmarkIndex);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                saveBtn.click();
            }
        });

        row.appendChild(form);
        this.destroyCategoryReorderInstances();
        this.initializeCategoryReorder();
        nameInput.focus();
        nameInput.select();
    }

    async commitBookmarkInlineEdit(bookmarkIndex, fields) {
        const bookmark = this.bookmarks[bookmarkIndex];
        if (!bookmark) {
            return;
        }

        const name = fields.nameInput.value.trim();
        const url = fields.urlInput.value.trim();
        const shortcut = fields.shortcutInput.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
        const category = fields.catSelect.value;

        if (!name || !url) {
            this.showErrorNotification('Name and URL are required.');
            return;
        }

        this.ensureBookmarkMutationSnapshot();
        bookmark.name = name;
        bookmark.url = url;
        bookmark.shortcut = shortcut;
        bookmark.category = category;
        bookmark.pinned = fields.pinInput.checked;
        bookmark.checkStatus = fields.statusInput.checked;

        this.inlineEditingBookmarkIndex = null;
        this.renderDashboard();
        this.scheduleBookmarkOrderSave();
    }

    cancelBookmarkInlineEdit(row, bookmarkIndex) {
        const bookmark = this.bookmarks[bookmarkIndex];
        if (!bookmark) {
            this.inlineEditingBookmarkIndex = null;
            this.renderDashboard();
            return;
        }
        const categoryId = row.getAttribute('data-category-id') || bookmark.category || '';
        this.inlineEditingBookmarkIndex = null;
        this.populateBookmarkRowView(row, bookmark, categoryId, true);
        this.destroyCategoryReorderInstances();
        this.initializeCategoryReorder();
    }

    async deleteBookmarkAtIndexInline(bookmarkIndex) {
        const bookmark = this.bookmarks[bookmarkIndex];
        if (!bookmark) {
            return;
        }

        let confirmed = false;
        if (window.AppModal && typeof window.AppModal.danger === 'function') {
            const safeName = String(bookmark.name || 'Bookmark').replace(/</g, '');
            confirmed = await window.AppModal.danger({
                title: 'Delete bookmark',
                message: `Remove "${safeName}"?`,
                confirmText: 'Delete',
                cancelText: 'Cancel'
            });
        } else {
            confirmed = window.confirm('Delete this bookmark?');
        }

        if (!confirmed) {
            return;
        }

        this.ensureBookmarkMutationSnapshot();
        this.bookmarks.splice(bookmarkIndex, 1);
        this.inlineEditingBookmarkIndex = null;
        this.renderDashboard();
        this.scheduleBookmarkOrderSave();
    }

    createBookmarkElement(bookmark, categoryId, allowInlineEdit = true) {
        const row = document.createElement('div');
        this.populateBookmarkRowView(row, bookmark, categoryId, allowInlineEdit);
        return row;
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

        bookmark.openCount = Number(bookmark.openCount || 0) + 1;
        bookmark.lastOpened = Date.now();
        this.syncAllBookmarksMetadata(bookmark);
        this.refreshSmartCollectionsAfterOpen(bookmark.url);

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

    syncAllBookmarksMetadata(updatedBookmark) {
        if (!updatedBookmark || !Array.isArray(this.allBookmarks)) {
            return;
        }

        const updatedUrl = (updatedBookmark.url || '').trim();
        if (!updatedUrl) {
            return;
        }

        this.allBookmarks.forEach((bookmark) => {
            const bookmarkUrl = (bookmark.url || '').trim();
            if (!bookmarkUrl || bookmarkUrl !== updatedUrl) {
                return;
            }

            if (Number(bookmark.pageId) === Number(this.currentPageId)) {
                bookmark.lastOpened = updatedBookmark.lastOpened;
                bookmark.openCount = updatedBookmark.openCount;
            }
        });
    }

    refreshSmartCollectionsAfterOpen(url) {
        if (!url) {
            return;
        }

        // Multiple smart collections can change when openCount/lastOpened updates.
        this.renderDashboard();
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
