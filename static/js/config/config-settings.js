/**
 * Settings Module
 * Handles settings UI and configuration
 */

class ConfigSettings {
    constructor(language) {
        this.language = language;
        this.t = language.t.bind(language); // Translation function
        this.customThemes = {}; // Store available custom themes (id -> name)
        this.legacyThemeMap = {
            aurora: 'aurora-borealis',
            cyberpunk: 'neon-grid',
            ember: 'desert-ember',
            forest: 'forest-moss',
            lavender: 'lavender-mist',
            matcha: 'forest-moss',
            midnight: 'midnight-terminal',
            mint: 'iceberg',
            nerd: 'midnight-terminal',
            ocean: 'iceberg',
            paper: 'paper-ink',
            peach: 'desert-ember',
            sunset: 'sunset-pulse',
            synthwave: 'neon-grid',
            void: 'void-mono'
        };
        this.themePreviewLabels = {
            dark: 'Dark',
            light: 'Light',
            'aurora-borealis': 'Dark',
            'blush-daylight': 'Light',
            'citrus-sky': 'Light',
            'desert-ember': 'Dark',
            'forest-moss': 'Dark',
            iceberg: 'Light',
            'lavender-mist': 'Light',
            'midnight-terminal': 'Dark',
            'neon-grid': 'Neon',
            'paper-ink': 'Light',
            'porcelain-blue': 'Light',
            'sunset-pulse': 'Dark',
            'void-mono': 'Dark'
        };
    }

    normalizeThemeId(themeId) {
        if (!themeId) return themeId;
        return this.legacyThemeMap[themeId] || themeId;
    }

    formatThemeLabel(themeId, fallbackName) {
        const baseName = (fallbackName || this.t('config.unnamedTheme')).toString();
        const preview = this.themePreviewLabels[themeId];
        if (!preview) {
            return baseName;
        }
        return `${baseName} [${preview}]`;
    }

    /**
     * Load available custom themes from API
     */
    async loadCustomThemes() {
        try {
            const response = await fetch('/api/colors/custom-themes');
            if (response.ok) {
                this.customThemes = await response.json();
                // Expose a normalized list of custom theme ids for other modules
                window.CustomThemeIds = Array.isArray(this.customThemes)
                    ? this.customThemes
                    : Object.keys(this.customThemes || {});
                this.populateThemeSelect();
            }
        } catch (error) {
            console.error('Error loading custom themes:', error);
        }
    }

    populateThemeSelect() {
        const themeSelect = document.getElementById('theme-select');
        if (!themeSelect) return;

        const currentValue = themeSelect.value;

        themeSelect.innerHTML = '';

        const darkOption = document.createElement('option');
        darkOption.value = 'dark';
        darkOption.textContent = this.formatThemeLabel('dark', this.t('dashboard.darkTheme'));
        themeSelect.appendChild(darkOption);

        const lightOption = document.createElement('option');
        lightOption.value = 'light';
        lightOption.textContent = this.formatThemeLabel('light', this.t('dashboard.lightTheme'));
        themeSelect.appendChild(lightOption);

        if (this.customThemes && typeof this.customThemes === 'object') {
            const sortedCustomThemes = Object.entries(this.customThemes).sort(([, nameA], [, nameB]) => {
                const safeNameA = (nameA || this.t('config.unnamedTheme')).toString();
                const safeNameB = (nameB || this.t('config.unnamedTheme')).toString();
                return safeNameA.localeCompare(safeNameB, undefined, { sensitivity: 'base' });
            });

            sortedCustomThemes.forEach(([themeId, themeName]) => {
                const option = document.createElement('option');
                option.value = themeId;
                option.textContent = this.formatThemeLabel(themeId, themeName || this.t('config.unnamedTheme'));
                themeSelect.appendChild(option);
            });
        }

        if (currentValue) {
            themeSelect.value = currentValue;
        }
    }

    /**
     * Setup event listeners for all settings controls
     * @param {Object} settings - Reference to settings object
     * @param {Function} callbacks - Object with callback functions
     */
    async setupListeners(settings, callbacks) {
        // Load custom themes first
        await this.loadCustomThemes();
        
        // Language select
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            this.language.setupLanguageSelector();
            languageSelect.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                settings.language = newLang;
                await this.language.loadTranslations(newLang);
                await this.saveSettingsToServer(settings);
            });
        }
        
        // Theme select
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            const preferredTheme = this.normalizeThemeId(settings.theme || 'dark');
            const hasPreferredTheme = Array.from(themeSelect.options).some(option => option.value === preferredTheme);
            themeSelect.value = hasPreferredTheme ? preferredTheme : 'dark';
            settings.theme = themeSelect.value;
            themeSelect.addEventListener('change', (e) => {
                settings.theme = e.target.value;
                if (callbacks.onThemeChange) callbacks.onThemeChange(settings.theme);
                this.reloadThemeCSS();
            });
        }

        // Columns input
        const columnsInput = document.getElementById('columns-input');
        if (columnsInput) {
            columnsInput.value = settings.columnsPerRow;
            columnsInput.addEventListener('input', (e) => {
                settings.columnsPerRow = parseInt(e.target.value);
            });
        }

        const sortMethodSelect = document.getElementById('sort-method-select');
        if (sortMethodSelect) {
            sortMethodSelect.value = settings.sortMethod || 'order';
            sortMethodSelect.addEventListener('change', (e) => {
                settings.sortMethod = e.target.value;
            });
        }

        const layoutPresetSelect = document.getElementById('layout-preset-select');
        if (layoutPresetSelect) {
            layoutPresetSelect.value = settings.layoutPreset || 'default';
            layoutPresetSelect.addEventListener('change', (e) => {
                settings.layoutPreset = e.target.value;
                if (callbacks.onLayoutPresetChange) callbacks.onLayoutPresetChange(settings.layoutPreset);
            });
        }

        const autoDarkModeCheckbox = document.getElementById('auto-dark-mode-checkbox');
        if (autoDarkModeCheckbox) {
            autoDarkModeCheckbox.checked = settings.autoDarkMode === true;
            autoDarkModeCheckbox.addEventListener('change', (e) => {
                settings.autoDarkMode = e.target.checked;
                if (callbacks.onAutoDarkModeChange) callbacks.onAutoDarkModeChange(settings.autoDarkMode);
            });
        }

        const backgroundOpacityInput = document.getElementById('background-opacity-input');
        const backgroundOpacityValue = document.getElementById('background-opacity-value');
        if (backgroundOpacityInput) {
            const initialOpacity = Number(settings.backgroundOpacity ?? 1);
            backgroundOpacityInput.value = String(initialOpacity);
            if (backgroundOpacityValue) {
                backgroundOpacityValue.textContent = `${Math.round(initialOpacity * 100)}%`;
            }
            backgroundOpacityInput.addEventListener('input', (e) => {
                const value = Number(e.target.value);
                settings.backgroundOpacity = value;
                if (backgroundOpacityValue) {
                    backgroundOpacityValue.textContent = `${Math.round(value * 100)}%`;
                }
                if (callbacks.onBackgroundOpacityChange) callbacks.onBackgroundOpacityChange(value);
            });
        }

        const fontWeightSelect = document.getElementById('font-weight-select');
        if (fontWeightSelect) {
            fontWeightSelect.value = settings.fontWeight || 'normal';
            fontWeightSelect.addEventListener('change', (e) => {
                settings.fontWeight = e.target.value;
                if (callbacks.onFontWeightChange) callbacks.onFontWeightChange(settings.fontWeight);
            });
        }

        // Font size selector buttons
        const fontSizeOptions = document.querySelectorAll('.font-size-option');

        if (fontSizeOptions.length > 0) {
            // Normalize legacy alias values (if any) to current map
            const aliasMap = {
                small: 'sm',
                medium: 'm',
                large: 'l'
            };

            let fontSizeValue = settings.fontSize;
            if (fontSizeValue && aliasMap[fontSizeValue]) {
                fontSizeValue = aliasMap[fontSizeValue];
            }

            // Set initial active button
            const initialSize = fontSizeValue || 'm';
            fontSizeOptions.forEach(btn => {
                if (btn.dataset.size === initialSize) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Ensure the current font size is applied immediately
            settings.fontSize = initialSize;
            if (callbacks.onFontSizeChange) callbacks.onFontSizeChange(settings.fontSize);

            // Listen for changes
            fontSizeOptions.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const fontSize = e.target.dataset.size;
                    settings.fontSize = fontSize;

                    // Update active state
                    fontSizeOptions.forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');

                    if (callbacks.onFontSizeChange) callbacks.onFontSizeChange(settings.fontSize);
                });
            });
        }

        // New tab checkbox
        const newTabCheckbox = document.getElementById('new-tab-checkbox');
        if (newTabCheckbox) {
            newTabCheckbox.checked = settings.openInNewTab;
            newTabCheckbox.addEventListener('change', (e) => {
                settings.openInNewTab = e.target.checked;
            });
        }

        // HyprMode checkbox
        const hyprModeCheckbox = document.getElementById('hypr-mode-checkbox');
        if (hyprModeCheckbox) {
            hyprModeCheckbox.checked = settings.hyprMode || false;
            hyprModeCheckbox.addEventListener('change', (e) => {
                settings.hyprMode = e.target.checked;
                // Disable preview if callback is provided
                if (callbacks.onHyprModeChange) callbacks.onHyprModeChange(settings.hyprMode);
            });
        }

        // HyprMode info button
        const hyprModeInfoBtn = document.getElementById('hypr-mode-info-btn');
        if (hyprModeInfoBtn) {
            hyprModeInfoBtn.addEventListener('click', () => {
                if (window.AppModal) {
                    window.AppModal.alert({
                        title: this.t('config.hyprModeInfoTitle'),
                        htmlMessage: this.t('config.hyprModeInfoMessage').replace(/\n/g, '<br>'),
                        confirmText: this.t('config.gotIt')
                    });
                }
            });
        }

        // Interleave mode info button
        const interleaveModeInfoBtn = document.getElementById('interleave-mode-info-btn');
        if (interleaveModeInfoBtn) {
            interleaveModeInfoBtn.addEventListener('click', () => {
                if (window.AppModal) {
                    window.AppModal.alert({
                        title: this.t('config.interleaveModeInfoTitle'),
                        htmlMessage: this.t('config.interleaveModeInfoMessage').replace(/\n/g, '<br>'),
                        confirmText: this.t('config.gotIt')
                    });
                }
            });
        }

        // Fuzzy suggestions info button
        const fuzzySuggestionsInfoBtn = document.getElementById('fuzzy-suggestions-info-btn');
        if (fuzzySuggestionsInfoBtn) {
            fuzzySuggestionsInfoBtn.addEventListener('click', () => {
                if (window.AppModal) {
                    window.AppModal.alert({
                        title: this.t('config.fuzzySuggestionsInfoTitle'),
                        htmlMessage: this.t('config.fuzzySuggestionsInfoMessage').replace(/\n/g, '<br>'),
                        confirmText: this.t('config.gotIt')
                    });
                }
            });
        }

        // Include finders in search info button
        const includeFindersInSearchInfoBtn = document.getElementById('include-finders-in-search-info-btn');
        if (includeFindersInSearchInfoBtn) {
            includeFindersInSearchInfoBtn.addEventListener('click', () => {
                if (window.AppModal) {
                    window.AppModal.alert({
                        title: this.t('config.includeFindersInSearchInfoTitle'),
                        htmlMessage: this.t('config.includeFindersInSearchInfoMessage').replace(/\n/g, '<br>'),
                        confirmText: this.t('config.gotIt')
                    });
                }
            });
        }

        // Show background dots checkbox
        const showBackgroundDotsCheckbox = document.getElementById('show-background-dots-checkbox');
        if (showBackgroundDotsCheckbox) {
            showBackgroundDotsCheckbox.checked = settings.showBackgroundDots !== false;
            showBackgroundDotsCheckbox.addEventListener('change', (e) => {
                settings.showBackgroundDots = e.target.checked;
                if (callbacks.onBackgroundDotsChange) callbacks.onBackgroundDotsChange(e.target.checked);
            });
        }

        // Show icons checkbox
        const showIconsCheckbox = document.getElementById('show-icons-checkbox');
        if (showIconsCheckbox) {
            showIconsCheckbox.checked = settings.showIcons !== false;
            showIconsCheckbox.addEventListener('change', (e) => {
                settings.showIcons = e.target.checked;
            });
        }

        // Show title checkbox
        const showTitleCheckbox = document.getElementById('show-title-checkbox');
        if (showTitleCheckbox) {
            showTitleCheckbox.checked = settings.showTitle;
            showTitleCheckbox.addEventListener('change', (e) => {
                settings.showTitle = e.target.checked;
            });
        }

        // Enable custom title checkbox
        const enableCustomTitleCheckbox = document.getElementById('enable-custom-title-checkbox');
        if (enableCustomTitleCheckbox) {
            enableCustomTitleCheckbox.checked = settings.enableCustomTitle;
            enableCustomTitleCheckbox.addEventListener('change', (e) => {
                settings.enableCustomTitle = e.target.checked;
                this.toggleCustomTitleInput(e.target.checked);
            });
        }

        // Custom title input
        const customTitleInput = document.getElementById('custom-title-input');
        if (customTitleInput) {
            customTitleInput.value = settings.customTitle || '';
            customTitleInput.addEventListener('input', (e) => {
                const value = e.target.value.trim();
                settings.customTitle = value;
                
                // Auto-enable checkbox when user starts typing (only if not already enabled)
                if (value && !settings.enableCustomTitle) {
                    settings.enableCustomTitle = true;
                    const checkbox = document.getElementById('enable-custom-title-checkbox');
                    if (checkbox) checkbox.checked = true;
                    this.toggleCustomTitleInput(true);
                }
            });
            // Initial visibility
            this.toggleCustomTitleInput(settings.enableCustomTitle);
        }

        // Enable custom favicon checkbox
        const enableCustomFaviconCheckbox = document.getElementById('enable-custom-favicon-checkbox');
        if (enableCustomFaviconCheckbox) {
            enableCustomFaviconCheckbox.checked = settings.enableCustomFavicon;
            enableCustomFaviconCheckbox.addEventListener('change', async (e) => {
                settings.enableCustomFavicon = e.target.checked;
                this.toggleCustomFaviconInput(e.target.checked);
                // Always save to server regardless of device-specific settings
                await this.saveSettingsToServer(settings);
            });
        }

        // Custom favicon input
        const customFaviconInput = document.getElementById('custom-favicon-input');
        if (customFaviconInput) {
            customFaviconInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const formData = new FormData();
                    formData.append('favicon', file);

                    try {
                        const response = await fetch('/api/favicon', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const result = await response.json();
                            settings.customFaviconPath = result.path;
                            // Auto-enable checkbox when user uploads a file
                            if (!settings.enableCustomFavicon) {
                                settings.enableCustomFavicon = true;
                                const checkbox = document.getElementById('enable-custom-favicon-checkbox');
                                if (checkbox) checkbox.checked = true;
                                this.toggleCustomFaviconInput(true);
                            }
                            // Always save to server regardless of device-specific settings
                            await this.saveSettingsToServer(settings);
                        } else {
                            console.error('Failed to upload favicon');
                        }
                    } catch (error) {
                        console.error('Error uploading favicon:', error);
                    }
                }
            });
            // Initial visibility
            this.toggleCustomFaviconInput(settings.enableCustomFavicon);
        }

        // Enable custom font checkbox
        const enableCustomFontCheckbox = document.getElementById('enable-custom-font-checkbox');
        if (enableCustomFontCheckbox) {
            enableCustomFontCheckbox.checked = settings.enableCustomFont;
            enableCustomFontCheckbox.addEventListener('change', async (e) => {
                settings.enableCustomFont = e.target.checked;
                this.toggleCustomFontInput(e.target.checked);
                if (e.target.checked && settings.customFontPath) {
                    // Apply the font if enabled and path exists
                    if (window.ConfigFont) {
                        window.ConfigFont.applyFont(settings.customFontPath);
                    }
                } else if (!e.target.checked) {
                    // Reset to default font
                    if (window.ConfigFont) {
                        window.ConfigFont.resetFont();
                    }
                }
                await this.saveSettingsToServer(settings);
            });
        }

        // Custom font input
        const customFontInput = document.getElementById('custom-font-input');
        if (customFontInput) {
            customFontInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const result = await window.ConfigFont.uploadFont(file);
                        settings.customFontPath = result;
                        // Auto-enable checkbox when user uploads a file
                        if (!settings.enableCustomFont) {
                            settings.enableCustomFont = true;
                            const checkbox = document.getElementById('enable-custom-font-checkbox');
                            if (checkbox) checkbox.checked = true;
                            this.toggleCustomFontInput(true);
                        }
                        // Apply the font immediately
                        window.ConfigFont.applyFont(settings.customFontPath);
                        // Always save to server regardless of device-specific settings
                        await this.saveSettingsToServer(settings);
                    } catch (error) {
                        console.error('Error uploading font:', error);
                    }
                }
            });
            // Initial visibility
            this.toggleCustomFontInput(settings.enableCustomFont);
        }

        // Show page in title checkbox
        const showPageInTitleCheckbox = document.getElementById('show-page-in-title-checkbox');
        if (showPageInTitleCheckbox) {
            showPageInTitleCheckbox.checked = settings.showPageInTitle;
            showPageInTitleCheckbox.addEventListener('change', (e) => {
                settings.showPageInTitle = e.target.checked;
            });
        }

        // Show date checkbox
        const showDateCheckbox = document.getElementById('show-date-checkbox');
        if (showDateCheckbox) {
            showDateCheckbox.checked = settings.showDate;
            showDateCheckbox.addEventListener('change', (e) => {
                settings.showDate = e.target.checked;
            });
        }

        // Show config button checkbox
        const showConfigButtonCheckbox = document.getElementById('show-config-button-checkbox');
        if (showConfigButtonCheckbox) {
            showConfigButtonCheckbox.checked = settings.showConfigButton;
            showConfigButtonCheckbox.addEventListener('change', (e) => {
                settings.showConfigButton = e.target.checked;
            });
        }

        // Show page names in tabs checkbox
        const showPageNamesInTabsCheckbox = document.getElementById('show-page-names-in-tabs-checkbox');
        if (showPageNamesInTabsCheckbox) {
            showPageNamesInTabsCheckbox.checked = settings.showPageNamesInTabs;
            showPageNamesInTabsCheckbox.addEventListener('change', (e) => {
                settings.showPageNamesInTabs = e.target.checked;
            });
        }

        // Show page tabs checkbox
        const showPageTabsCheckbox = document.getElementById('show-page-tabs-checkbox');
        if (showPageTabsCheckbox) {
            showPageTabsCheckbox.checked = settings.showPageTabs;
            showPageTabsCheckbox.addEventListener('change', (e) => {
                settings.showPageTabs = e.target.checked;
            });
        }

        // Always collapse categories checkbox
        const alwaysCollapseCategoriesCheckbox = document.getElementById('always-collapse-categories-checkbox');
        if (alwaysCollapseCategoriesCheckbox) {
            alwaysCollapseCategoriesCheckbox.checked = settings.alwaysCollapseCategories;
            alwaysCollapseCategoriesCheckbox.addEventListener('change', (e) => {
                settings.alwaysCollapseCategories = e.target.checked;
            });
        }

        // Show search button checkbox
        const showSearchButtonCheckbox = document.getElementById('show-search-button-checkbox');
        if (showSearchButtonCheckbox) {
            showSearchButtonCheckbox.checked = settings.showSearchButton;
            showSearchButtonCheckbox.addEventListener('change', (e) => {
                settings.showSearchButton = e.target.checked;
            });
        }

        // Show finders button checkbox
        const showFindersButtonCheckbox = document.getElementById('show-finders-button-checkbox');
        if (showFindersButtonCheckbox) {
            showFindersButtonCheckbox.checked = settings.showFindersButton;
            showFindersButtonCheckbox.addEventListener('change', (e) => {
                settings.showFindersButton = e.target.checked;
            });
        }

        // Show commands button checkbox
        const showCommandsButtonCheckbox = document.getElementById('show-commands-button-checkbox');
        if (showCommandsButtonCheckbox) {
            showCommandsButtonCheckbox.checked = settings.showCommandsButton;
            showCommandsButtonCheckbox.addEventListener('change', (e) => {
                settings.showCommandsButton = e.target.checked;
            });
        }

        // Show cheatsheet button checkbox
        const showCheatSheetButtonCheckbox = document.getElementById('show-cheatsheet-button-checkbox');
        if (showCheatSheetButtonCheckbox) {
            showCheatSheetButtonCheckbox.checked = settings.showCheatSheetButton !== false;
            showCheatSheetButtonCheckbox.addEventListener('change', (e) => {
                settings.showCheatSheetButton = e.target.checked;
            });
        }

        // Show search button text checkbox
        const showSearchButtonTextCheckbox = document.getElementById('show-search-button-text-checkbox');
        if (showSearchButtonTextCheckbox) {
            showSearchButtonTextCheckbox.checked = settings.showSearchButtonText !== false;
            showSearchButtonTextCheckbox.addEventListener('change', (e) => {
                settings.showSearchButtonText = e.target.checked;
            });
        }

        // Show finders button text checkbox
        const showFindersButtonTextCheckbox = document.getElementById('show-finders-button-text-checkbox');
        if (showFindersButtonTextCheckbox) {
            showFindersButtonTextCheckbox.checked = settings.showFindersButtonText !== false;
            showFindersButtonTextCheckbox.addEventListener('change', (e) => {
                settings.showFindersButtonText = e.target.checked;
            });
        }

        // Show commands button text checkbox
        const showCommandsButtonTextCheckbox = document.getElementById('show-commands-button-text-checkbox');
        if (showCommandsButtonTextCheckbox) {
            showCommandsButtonTextCheckbox.checked = settings.showCommandsButtonText !== false;
            showCommandsButtonTextCheckbox.addEventListener('change', (e) => {
                settings.showCommandsButtonText = e.target.checked;
            });
        }

        // Include finders in search checkbox
        const includeFindersInSearchCheckbox = document.getElementById('include-finders-in-search-checkbox');
        if (includeFindersInSearchCheckbox) {
            includeFindersInSearchCheckbox.checked = settings.includeFindersInSearch;
            includeFindersInSearchCheckbox.addEventListener('change', (e) => {
                settings.includeFindersInSearch = e.target.checked;
            });
        }

        // Animations enabled checkbox
        const animationsEnabledCheckbox = document.getElementById('animations-enabled-checkbox');
        if (animationsEnabledCheckbox) {
            animationsEnabledCheckbox.checked = settings.animationsEnabled !== false;
            animationsEnabledCheckbox.addEventListener('change', (e) => {
                settings.animationsEnabled = e.target.checked;
                if (callbacks.onAnimationsChange) callbacks.onAnimationsChange(e.target.checked);
            });
        }

        // Show status checkbox
        const showStatusCheckbox = document.getElementById('show-status-checkbox');
        if (showStatusCheckbox) {
            showStatusCheckbox.checked = settings.showStatus;
            showStatusCheckbox.addEventListener('change', (e) => {
                settings.showStatus = e.target.checked;
                if (callbacks.onStatusVisibilityChange) callbacks.onStatusVisibilityChange();
            });
        }

        // Show ping checkbox
        const showPingCheckbox = document.getElementById('show-ping-checkbox');
        if (showPingCheckbox) {
            showPingCheckbox.checked = settings.showPing;
            showPingCheckbox.addEventListener('change', (e) => {
                settings.showPing = e.target.checked;
            });
        }

        // Show status loading checkbox
        const showStatusLoadingCheckbox = document.getElementById('show-status-loading-checkbox');
        if (showStatusLoadingCheckbox) {
            showStatusLoadingCheckbox.checked = settings.showStatusLoading;
            showStatusLoadingCheckbox.addEventListener('change', (e) => {
                settings.showStatusLoading = e.target.checked;
            });
        }

        // Skip fast ping checkbox
        const skipFastPingCheckbox = document.getElementById('skip-fast-ping-checkbox');
        if (skipFastPingCheckbox) {
            skipFastPingCheckbox.checked = settings.skipFastPing;
            skipFastPingCheckbox.addEventListener('change', (e) => {
                settings.skipFastPing = e.target.checked;
            });
        }

        // Global shortcuts checkbox
        const globalShortcutsCheckbox = document.getElementById('global-shortcuts-checkbox');
        if (globalShortcutsCheckbox) {
            globalShortcutsCheckbox.checked = settings.globalShortcuts || false;
            globalShortcutsCheckbox.addEventListener('change', (e) => {
                settings.globalShortcuts = e.target.checked;
            });
        }

        // Enable fuzzy suggestions checkbox
        const enableFuzzySuggestionsCheckbox = document.getElementById('enable-fuzzy-suggestions-checkbox');
        if (enableFuzzySuggestionsCheckbox) {
            enableFuzzySuggestionsCheckbox.checked = settings.enableFuzzySuggestions || false;
            enableFuzzySuggestionsCheckbox.addEventListener('change', (e) => {
                settings.enableFuzzySuggestions = e.target.checked;
                this.toggleFuzzySuggestionsStartWith(e.target.checked);
            });
        }

        // Initial visibility for fuzzy suggestions start with
        this.toggleFuzzySuggestionsStartWith(settings.enableFuzzySuggestions || false);

        // Fuzzy suggestions start with checkbox
        const fuzzySuggestionsStartWithCheckbox = document.getElementById('fuzzy-suggestions-start-with-checkbox');
        if (fuzzySuggestionsStartWithCheckbox) {
            fuzzySuggestionsStartWithCheckbox.checked = settings.fuzzySuggestionsStartWith || false;
            fuzzySuggestionsStartWithCheckbox.addEventListener('change', (e) => {
                settings.fuzzySuggestionsStartWith = e.target.checked;
            });
        }

        // Keep search open when empty checkbox
        const keepSearchOpenWhenEmptyCheckbox = document.getElementById('keep-search-open-when-empty-checkbox');
        if (keepSearchOpenWhenEmptyCheckbox) {
            keepSearchOpenWhenEmptyCheckbox.checked = settings.keepSearchOpenWhenEmpty || false;
            keepSearchOpenWhenEmptyCheckbox.addEventListener('change', (e) => {
                settings.keepSearchOpenWhenEmpty = e.target.checked;
            });
        }
    }

    /**
     * Update settings from UI elements
     * @param {Object} settings - Reference to settings object
     */
    updateFromUI(settings) {
        const themeSelect = document.getElementById('theme-select');
        const columnsInput = document.getElementById('columns-input'); 
        const newTabCheckbox = document.getElementById('new-tab-checkbox');
        const hyprModeCheckbox = document.getElementById('hypr-mode-checkbox');
        const showTitleCheckbox = document.getElementById('show-title-checkbox');
        const showDateCheckbox = document.getElementById('show-date-checkbox');
        const showConfigButtonCheckbox = document.getElementById('show-config-button-checkbox');
        const showSearchButtonCheckbox = document.getElementById('show-search-button-checkbox');
        const showFindersButtonCheckbox = document.getElementById('show-finders-button-checkbox');
        const showCommandsButtonCheckbox = document.getElementById('show-commands-button-checkbox');
        const showCheatSheetButtonCheckbox = document.getElementById('show-cheatsheet-button-checkbox');
        const showSearchButtonTextCheckbox = document.getElementById('show-search-button-text-checkbox');
        const showFindersButtonTextCheckbox = document.getElementById('show-finders-button-text-checkbox');
        const showCommandsButtonTextCheckbox = document.getElementById('show-commands-button-text-checkbox');
        const includeFindersInSearchCheckbox = document.getElementById('include-finders-in-search-checkbox');
        const showStatusCheckbox = document.getElementById('show-status-checkbox');
        const showPingCheckbox = document.getElementById('show-ping-checkbox');
        const showStatusLoadingCheckbox = document.getElementById('show-status-loading-checkbox');
        const skipFastPingCheckbox = document.getElementById('skip-fast-ping-checkbox');
        const globalShortcutsCheckbox = document.getElementById('global-shortcuts-checkbox');
        const animationsEnabledCheckbox = document.getElementById('animations-enabled-checkbox');
        const enableCustomTitleCheckbox = document.getElementById('enable-custom-title-checkbox');
        const customTitleInput = document.getElementById('custom-title-input');
        const showPageInTitleCheckbox = document.getElementById('show-page-in-title-checkbox');
        const showPageNamesInTabsCheckbox = document.getElementById('show-page-names-in-tabs-checkbox');
        const enableCustomFaviconCheckbox = document.getElementById('enable-custom-favicon-checkbox');
        const languageSelect = document.getElementById('language-select');
        const interleaveModeCheckbox = document.getElementById('interleave-mode-checkbox');
        const enableFuzzySuggestionsCheckbox = document.getElementById('enable-fuzzy-suggestions-checkbox');
        const fuzzySuggestionsStartWithCheckbox = document.getElementById('fuzzy-suggestions-start-with-checkbox');
        const keepSearchOpenWhenEmptyCheckbox = document.getElementById('keep-search-open-when-empty-checkbox');

        if (themeSelect) settings.theme = themeSelect.value;
        if (columnsInput) settings.columnsPerRow = parseInt(columnsInput.value);
        if (newTabCheckbox) settings.openInNewTab = newTabCheckbox.checked;
        if (hyprModeCheckbox) settings.hyprMode = hyprModeCheckbox.checked;
        if (showTitleCheckbox) settings.showTitle = showTitleCheckbox.checked;
        if (showDateCheckbox) settings.showDate = showDateCheckbox.checked;
        if (showConfigButtonCheckbox) settings.showConfigButton = showConfigButtonCheckbox.checked;
        if (showSearchButtonCheckbox) settings.showSearchButton = showSearchButtonCheckbox.checked;
        if (showFindersButtonCheckbox) settings.showFindersButton = showFindersButtonCheckbox.checked;
        if (showCommandsButtonCheckbox) settings.showCommandsButton = showCommandsButtonCheckbox.checked;
        if (showCheatSheetButtonCheckbox) settings.showCheatSheetButton = showCheatSheetButtonCheckbox.checked;
        if (showSearchButtonTextCheckbox) settings.showSearchButtonText = showSearchButtonTextCheckbox.checked;
        if (showFindersButtonTextCheckbox) settings.showFindersButtonText = showFindersButtonTextCheckbox.checked;
        if (showCommandsButtonTextCheckbox) settings.showCommandsButtonText = showCommandsButtonTextCheckbox.checked;
        if (includeFindersInSearchCheckbox) settings.includeFindersInSearch = includeFindersInSearchCheckbox.checked;
        if (animationsEnabledCheckbox) settings.animationsEnabled = animationsEnabledCheckbox.checked;
        if (showStatusCheckbox) settings.showStatus = showStatusCheckbox.checked;
        if (showPingCheckbox) settings.showPing = showPingCheckbox.checked;
        if (showStatusLoadingCheckbox) settings.showStatusLoading = showStatusLoadingCheckbox.checked;
        if (skipFastPingCheckbox) settings.skipFastPing = skipFastPingCheckbox.checked;
        if (globalShortcutsCheckbox) settings.globalShortcuts = globalShortcutsCheckbox.checked;
        if (enableCustomTitleCheckbox) settings.enableCustomTitle = enableCustomTitleCheckbox.checked;
        if (customTitleInput) settings.customTitle = customTitleInput.value;
        if (showPageInTitleCheckbox) settings.showPageInTitle = showPageInTitleCheckbox.checked;
        if (showPageNamesInTabsCheckbox) settings.showPageNamesInTabs = showPageNamesInTabsCheckbox.checked;
        const showPageTabsCheckbox = document.getElementById('show-page-tabs-checkbox');
        if (showPageTabsCheckbox) settings.showPageTabs = showPageTabsCheckbox.checked;
        const alwaysCollapseCategoriesCheckbox = document.getElementById('always-collapse-categories-checkbox');
        if (alwaysCollapseCategoriesCheckbox) settings.alwaysCollapseCategories = alwaysCollapseCategoriesCheckbox.checked;
        if (enableCustomFaviconCheckbox) settings.enableCustomFavicon = enableCustomFaviconCheckbox.checked;
        if (languageSelect) settings.language = languageSelect.value;
        if (interleaveModeCheckbox) settings.interleaveMode = interleaveModeCheckbox.checked;
        if (enableFuzzySuggestionsCheckbox) settings.enableFuzzySuggestions = enableFuzzySuggestionsCheckbox.checked;
        if (fuzzySuggestionsStartWithCheckbox) settings.fuzzySuggestionsStartWith = fuzzySuggestionsStartWithCheckbox.checked;
        if (keepSearchOpenWhenEmptyCheckbox) settings.keepSearchOpenWhenEmpty = keepSearchOpenWhenEmptyCheckbox.checked;
        const showIconsCheckbox = document.getElementById('show-icons-checkbox');
        if (showIconsCheckbox) settings.showIcons = showIconsCheckbox.checked;
    }

    /**
     * Apply theme to page
     * @param {string} theme
     */
    applyTheme(theme) {
        const normalizedTheme = this.normalizeThemeId(theme);

        // Remove all theme classes
        document.body.classList.remove('dark', 'light');
        
        // Remove any custom theme classes
        const themeIds = Array.isArray(this.customThemes)
            ? this.customThemes
            : (this.customThemes && typeof this.customThemes === 'object')
                ? Object.keys(this.customThemes)
                : [];

        themeIds.forEach(themeId => {
            document.body.classList.remove(themeId);
        });
        
        // Add the new theme class
        document.body.classList.add(normalizedTheme);
        document.body.setAttribute('data-theme', normalizedTheme);
        
        if (window.ThemeLoader) {
            const showBackgroundDots = document.getElementById('show-background-dots-checkbox')?.checked !== false;
            // Get current font size from body classes
            const currentClasses = Array.from(document.body.classList);
            const currentFontSizeClass = currentClasses.find(cls => cls.startsWith('font-size-'));
            const currentFontSize = currentFontSizeClass ? currentFontSizeClass.replace('font-size-', '') : 'm';
            window.ThemeLoader.applyTheme(normalizedTheme, showBackgroundDots, currentFontSize);
        }
    }

    reloadThemeCSS() {
        const link = document.querySelector('link[href^="/api/theme.css"]');
        if (!link || !link.parentNode) {
            return;
        }

        const newLink = link.cloneNode(true);
        newLink.href = `/api/theme.css?t=${Date.now()}`;
        link.parentNode.replaceChild(newLink, link);
    }

    /**
     * Apply font size to page
     * @param {string} fontSize
     */
    applyFontSize(fontSize) {
        document.body.classList.remove('font-size-xs', 'font-size-s', 'font-size-sm', 'font-size-m', 'font-size-lg', 'font-size-l', 'font-size-xl');
        document.body.classList.add(`font-size-${fontSize}`);
    }

    /**
     * Apply background dots setting
     * @param {boolean} showBackgroundDots
     */
    applyBackgroundDots(showBackgroundDots) {
        // Use ThemeLoader to apply background dots consistently
        if (window.ThemeLoader) {
            const theme = document.body.getAttribute('data-theme') || 'dark';
            // Get current font size from body classes
            const currentClasses = Array.from(document.body.classList);
            const currentFontSizeClass = currentClasses.find(cls => cls.startsWith('font-size-'));
            const currentFontSize = currentFontSizeClass ? currentFontSizeClass.replace('font-size-', '') : 'm';
            window.ThemeLoader.applyTheme(theme, showBackgroundDots, currentFontSize);
        }
        
        // Also set the data attribute for consistency
        if (showBackgroundDots !== false) {
            document.body.setAttribute('data-show-background-dots', 'true');
        } else {
            document.body.setAttribute('data-show-background-dots', 'false');
        }
    }

    /**
     * Update status options visibility
     * @param {boolean} showStatus
     */
    updateStatusOptionsVisibility(showStatus) {
        const statusNested = document.querySelector('.status-settings-nested');
        
        if (statusNested) {
            if (showStatus) {
                statusNested.style.display = 'block';
            } else {
                statusNested.style.display = 'none';
                // Also uncheck ping when status is disabled
                const showPingCheckbox = document.getElementById('show-ping-checkbox');
                if (showPingCheckbox) {
                    showPingCheckbox.checked = false;
                }
            }
        }
    }

    /**
     * Toggle custom title input visibility
     * @param {boolean} enabled
     */
    toggleCustomTitleInput(enabled) {
        // Find the checkbox
        const checkbox = document.getElementById('enable-custom-title-checkbox');
        if (!checkbox) return;
        
        // Find the parent item
        const parentItem = checkbox.closest('.checkbox-tree-item');
        if (!parentItem) return;
        
        // Find all sibling items after this one that are checkbox-tree-child
        const siblings = Array.from(parentItem.parentNode.children);
        const startIndex = siblings.indexOf(parentItem);
        
        for (let i = startIndex + 1; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling.classList.contains('checkbox-tree-child')) {
                sibling.style.display = enabled ? 'block' : 'none';
            } else {
                // Stop at the first non-child item (assuming they are grouped)
                break;
            }
        }
    }

    /**
     * Toggle fuzzy suggestions start with visibility
     * @param {boolean} enabled
     */
    toggleFuzzySuggestionsStartWith(enabled) {
        // Find the checkbox
        const checkbox = document.getElementById('enable-fuzzy-suggestions-checkbox');
        if (!checkbox) return;
        
        // Find the parent item
        const parentItem = checkbox.closest('.checkbox-tree-item');
        if (!parentItem) return;
        
        // Find all sibling items after this one that are checkbox-tree-child
        const siblings = Array.from(parentItem.parentNode.children);
        const startIndex = siblings.indexOf(parentItem);
        
        for (let i = startIndex + 1; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling.classList.contains('checkbox-tree-child')) {
                sibling.style.display = enabled ? 'block' : 'none';
            } else {
                // Stop at the first non-child item (assuming they are grouped)
                break;
            }
        }
    }

    /**
     * Toggle custom favicon input visibility
     * @param {boolean} enabled
     */
    toggleCustomFaviconInput(enabled) {
        // Find the checkbox
        const checkbox = document.getElementById('enable-custom-favicon-checkbox');
        if (!checkbox) return;
        
        // Find the parent item
        const parentItem = checkbox.closest('.checkbox-tree-item');
        if (!parentItem) return;
        
        // Find all sibling items after this one that are checkbox-tree-child
        const siblings = Array.from(parentItem.parentNode.children);
        const startIndex = siblings.indexOf(parentItem);
        
        for (let i = startIndex + 1; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling.classList.contains('checkbox-tree-child')) {
                sibling.style.display = enabled ? 'block' : 'none';
            } else {
                // Stop at the first non-child item (assuming they are grouped)
                break;
            }
        }
    }

    /**
     * Toggle visibility of custom font input based on checkbox state
     * @param {boolean} enabled - Whether custom font is enabled
     */
    toggleCustomFontInput(enabled) {
        // Find the checkbox
        const checkbox = document.getElementById('enable-custom-font-checkbox');
        if (!checkbox) return;
        
        // Find the parent item
        const parentItem = checkbox.closest('.checkbox-tree-item');
        if (!parentItem) return;
        
        // Find all sibling items after this one that are checkbox-tree-child
        const siblings = Array.from(parentItem.parentNode.children);
        const startIndex = siblings.indexOf(parentItem);
        
        for (let i = startIndex + 1; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling.classList.contains('checkbox-tree-child')) {
                sibling.style.display = enabled ? 'block' : 'none';
            } else {
                // Stop at the first non-child item (assuming they are grouped)
                break;
            }
        }
    }

    /**
     * Reset settings to defaults
     * @returns {Object} - Default settings
     */
    getDefaults() {
        return {
            theme: 'dark',
            openInNewTab: true,
            columnsPerRow: 3,
            fontSize: 'm',
            showBackgroundDots: true,
            showTitle: true,
            showDate: true,
            showConfigButton: true,
            showSearchButton: true,
            showFindersButton: true,
            showCommandsButton: true,
            showCheatSheetButton: true,
            showSearchButtonText: true,
            showFindersButtonText: true,
            showCommandsButtonText: true,
            showStatus: false,
            showPing: false,
            globalShortcuts: true,
            hyprMode: false,
            animationsEnabled: true,
            enableCustomTitle: false,
            customTitle: '',
            showPageInTitle: false,
            showPageNamesInTabs: false,
            enableCustomFavicon: false,
            customFaviconPath: '',
            language: 'en',
            interleaveMode: false,
            showPageTabs: true,
            alwaysCollapseCategories: false,
            backgroundOpacity: 1,
            fontWeight: 'normal',
            autoDarkMode: false
        };
    }

    /**
     * Apply animations setting to page
     * @param {boolean} enabled
     */
    applyAnimations(enabled) {
        if (enabled) {
            document.body.classList.remove('no-animations');
        } else {
            document.body.classList.add('no-animations');
        }
    }

    applyBackgroundOpacity(value) {
        const opacity = Number(value ?? 1);
        const clamped = Number.isFinite(opacity) ? Math.min(1, Math.max(0.65, opacity)) : 1;
        document.documentElement.style.setProperty('--dashboard-bg-opacity', String(clamped));
        document.body.style.opacity = String(clamped);
    }

    applyFontWeight(value) {
        const fontWeight = value || 'normal';
        document.documentElement.style.setProperty('--dashboard-font-weight', fontWeight);
        document.body.style.fontWeight = fontWeight;
    }

    applyAutoDarkMode(enabled, settings) {
        if (!enabled || !window.matchMedia) {
            return;
        }

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            const nextTheme = media.matches ? 'dark' : 'light';
            if (settings) {
                settings.theme = nextTheme;
            }
            this.applyTheme(nextTheme);
        };

        apply();

        if (!this._autoDarkModeListenerAttached && typeof media.addEventListener === 'function') {
            media.addEventListener('change', apply);
            this._autoDarkModeListenerAttached = true;
        }
    }

    /**
     * Save settings to server (used for favicon changes to always persist globally)
     * @param {Object} settings
     */
    async saveSettingsToServer(settings) {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
        } catch (error) {
            console.error('Error saving settings to server:', error);
        }
    }
}

// Export for use in other modules
window.ConfigSettings = ConfigSettings;
