/**
 * Bookmarks Module
 * Handles bookmark management (create, render, remove, reorder)
 */

class ConfigBookmarks {
    constructor(t) {
        this.t = t; // Translation function
        this.bookmarkReorder = null;
        this.currentFilterCategory = '__all__';
        this.keyboardReorderHandler = null;
        this.selectedBookmarkIndexes = new Set();
    }

    /**
     * Render bookmarks list
     * @param {Array} bookmarks
     * @param {Array} categories
     */
    render(bookmarks, categories, options = {}) {
        const container = document.getElementById('bookmarks-list');
        if (!container) return;

        this.renderInsightsPanel();

        this.currentFilterCategory = options.filterCategory || this.currentFilterCategory;

        container.innerHTML = '';

        const scopedBookmarks = this.getScopedBookmarks(bookmarks, this.currentFilterCategory);

        if (scopedBookmarks.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <div class="empty-state-icon">📚</div>
                <div class="empty-state-text">${this.t('config.noBookmarks') || 'No bookmarks in this category'}</div>
                <div class="empty-state-subtext">Use "Add Bookmark" below to create one quickly.</div>
            `;
            container.appendChild(emptyState);
            return;
        }

        scopedBookmarks.forEach(({ bookmark, index }) => {
            const bookmarkElement = this.createBookmarkElement(bookmark, index, bookmarks, categories, index);
            container.appendChild(bookmarkElement);
        });

        this.updateBulkSelectionToolbar();
    }

    async renderInsightsPanel() {
        const existing = document.getElementById('bookmarks-insights-panel');
        if (existing) {
            existing.remove();
        }

        const bookmarksTab = document.querySelector('[data-tab-content="bookmarks"] .config-section');
        if (!bookmarksTab) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'bookmarks-insights-panel';
        panel.className = 'duplicates-warning';
        panel.innerHTML = '<h4>Insights</h4><div class="duplicate-url">Loading analytics...</div>';
        bookmarksTab.insertBefore(panel, bookmarksTab.firstChild);

        try {
            const [analyticsRes, duplicatesRes] = await Promise.all([
                fetch('/api/analytics'),
                fetch('/api/duplicates')
            ]);

            const analytics = analyticsRes.ok ? await analyticsRes.json() : null;
            const duplicates = duplicatesRes.ok ? await duplicatesRes.json() : null;
            const duplicateCount = Array.isArray(duplicates?.duplicateUrls) ? duplicates.duplicateUrls.length : 0;
            const duplicateGroups = Array.isArray(duplicates?.duplicateUrls) ? duplicates.duplicateUrls : [];
            const hasStale = Array.isArray(analytics?.staleBookmarks) && analytics.staleBookmarks.length > 0;
            const hasDetails = hasStale || duplicateGroups.length > 0;

            panel.innerHTML = `
                <h4>Insights</h4>
                <div class="duplicate-items">
                    <span class="duplicate-item">Total: ${analytics?.totalBookmarks ?? 0}</span>
                    <span class="duplicate-item">Unused: ${analytics?.unusedCount ?? 0}</span>
                    <span class="duplicate-item">Stale (30d): ${analytics?.staleCount ?? 0}</span>
                    <span class="duplicate-item">Duplicate URLs: ${duplicateCount}</span>
                </div>
                ${hasDetails ? `
                    <div class="duplicates-actions" style="margin: 0.5rem 0 0.75rem 0;">
                        <button type="button" class="btn btn-secondary btn-small" id="toggle-insights-details-btn">Show details</button>
                        ${hasStale ? `
                        <button type="button" class="btn btn-secondary btn-small" id="move-stale-to-archive-btn">
                            Move stale bookmarks to Archive
                        </button>
                        ` : ''}
                    </div>
                ` : ''}
                <div id="insights-details" style="display: none;">
                ${hasStale ? `
                    <div class="duplicates-list">
                        ${analytics.staleBookmarks.slice(0, 8).map((bookmark) => `
                            <div class="duplicate-group">
                                <div class="duplicate-url">${bookmark.name}</div>
                                <div class="duplicate-items">
                                    <span class="duplicate-item">${bookmark.url}</span>
                                    <span class="duplicate-item">Page: ${bookmark.pageId ?? '-'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${duplicateGroups.length > 0 ? `
                    <div class="duplicates-list">
                        ${duplicateGroups.map((group) => `
                            <div class="duplicate-group">
                                <div class="duplicate-url">${group.url}</div>
                                <button type="button" class="btn btn-secondary btn-small" data-merge-url="${group.url}">Merge duplicates</button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                </div>
            `;

            panel.querySelectorAll('[data-merge-url]').forEach((button) => {
                button.addEventListener('click', () => {
                    const url = button.getAttribute('data-merge-url');
                    this.mergeDuplicatesByUrl(url);
                });
            });

            const toggleDetailsButton = panel.querySelector('#toggle-insights-details-btn');
            const detailsSection = panel.querySelector('#insights-details');
            if (toggleDetailsButton && detailsSection) {
                toggleDetailsButton.addEventListener('click', () => {
                    const isHidden = detailsSection.style.display === 'none';
                    detailsSection.style.display = isHidden ? 'block' : 'none';
                    toggleDetailsButton.textContent = isHidden ? 'Hide details' : 'Show details';
                });
            }

            const moveStaleButton = panel.querySelector('#move-stale-to-archive-btn');
            if (moveStaleButton) {
                moveStaleButton.addEventListener('click', () => {
                    this.moveStaleBookmarksToArchive();
                });
            }
        } catch (error) {
            panel.innerHTML = '<h4>Insights</h4><div class="duplicate-url">Unable to load insights.</div>';
        }
    }

    moveStaleBookmarksToArchive() {
        if (!window.configManager || !Array.isArray(window.configManager.bookmarksData)) {
            return;
        }

        const now = Date.now();
        const staleThresholdMs = 30 * 24 * 60 * 60 * 1000;
        const archiveCategoryId = 'archive';

        if (!Array.isArray(window.configManager.categoriesData)) {
            window.configManager.categoriesData = [];
        }

        const hasArchive = window.configManager.categoriesData.some((category) => category.id === archiveCategoryId);
        if (!hasArchive) {
            window.configManager.categoriesData.push({
                id: archiveCategoryId,
                name: 'Archive',
                icon: '📦'
            });
            if (window.configManager.categories && typeof window.configManager.categories.render === 'function') {
                window.configManager.categories.render(
                    window.configManager.categoriesData,
                    window.configManager.generateId.bind(window.configManager)
                );
            }
        }

        let moved = 0;
        window.configManager.bookmarksData.forEach((bookmark) => {
            const lastOpened = Number(bookmark.lastOpened || 0);
            const isStale = lastOpened === 0 || (now - lastOpened) > staleThresholdMs;
            if (!isStale) {
                return;
            }
            if (bookmark.category !== archiveCategoryId) {
                bookmark.category = archiveCategoryId;
                moved += 1;
            }
        });

        window.configManager.refreshBookmarksFilterOptions();
        window.configManager.refreshBookmarksList();

        if (window.configManager.ui) {
            if (moved > 0) {
                window.configManager.ui.showNotification(`Moved ${moved} stale bookmark(s) to Archive.`, 'success');
            } else {
                window.configManager.ui.showNotification('No stale bookmarks to move in this page.', 'info');
            }
        }
    }

    mergeDuplicatesByUrl(url) {
        if (!url || !window.configManager || !Array.isArray(window.configManager.bookmarksData)) {
            return;
        }

        const normalized = url.trim().toLowerCase();
        const seen = new Set();
        window.configManager.bookmarksData = window.configManager.bookmarksData.filter((bookmark) => {
            const bookmarkUrl = (bookmark.url || '').trim().toLowerCase();
            if (bookmarkUrl !== normalized) {
                return true;
            }
            if (seen.has(bookmarkUrl)) {
                return false;
            }
            seen.add(bookmarkUrl);
            return true;
        });

        window.configManager.refreshBookmarksList();
        if (window.configManager.ui) {
            window.configManager.ui.showNotification('Duplicates merged for selected URL.', 'success');
        }
    }

    getScopedBookmarks(bookmarks, filterCategory = '__all__') {
        if (!Array.isArray(bookmarks)) {
            return [];
        }

        if (filterCategory === '__all__') {
            return bookmarks.map((bookmark, index) => ({ bookmark, index }));
        }

        if (filterCategory === '__none__') {
            return bookmarks
                .map((bookmark, index) => ({ bookmark, index }))
                .filter(({ bookmark }) => !bookmark.category);
        }

        return bookmarks
            .map((bookmark, index) => ({ bookmark, index }))
            .filter(({ bookmark }) => bookmark.category === filterCategory);
    }

    /**
     * Create a bookmark DOM element
     * @param {Object} bookmark
     * @param {number} index
     * @param {Array} bookmarks - Reference to bookmarks array
     * @param {Array} categories
     * @returns {HTMLElement}
     */
    createBookmarkElement(bookmark, index, bookmarks, categories, fullIndex = index) {
        const div = document.createElement('div');
        div.className = 'bookmark-item js-item is-idle';
        div.setAttribute('data-bookmark-index', fullIndex);
        // Use index as a stable identifier since bookmarks don't have IDs
        div.setAttribute('data-bookmark-key', fullIndex);

        // Create category options
        const cats = Array.isArray(categories) ? categories : [];
        const categoryOptions = cats.map(cat => 
            `<option value="${cat.id}" ${cat.id === bookmark.category ? 'selected' : ''}>${cat.name}</option>`
        ).join('');

        div.innerHTML = `
            <label class="bookmark-select-wrap">
                <input type="checkbox" class="bookmark-select-checkbox" data-bookmark-select="${fullIndex}" ${this.selectedBookmarkIndexes.has(fullIndex) ? 'checked' : ''}>
            </label>
            <span class="drag-handle js-drag-handle" title="Drag to reorder">⠿</span>
            <button type="button" class="btn btn-secondary btn-small" onclick="configManager.moveBookmark(${fullIndex})" title="${this.t('config.moveBookmark')}">→</button>
            <input type="text" id="bookmark-name-${fullIndex}" name="bookmark-name-${fullIndex}" value="${bookmark.name}" placeholder="${this.t('config.bookmarkNamePlaceholder')}" data-bookmark-key="${fullIndex}" data-field="name">
            <input type="url" id="bookmark-url-${fullIndex}" name="bookmark-url-${fullIndex}" value="${bookmark.url}" placeholder="${this.t('config.bookmarkUrlPlaceholder')}" data-bookmark-key="${fullIndex}" data-field="url">
            <input type="text" id="bookmark-shortcut-${fullIndex}" name="bookmark-shortcut-${fullIndex}" value="${bookmark.shortcut || ''}" placeholder="${this.t('config.bookmarkShortcutPlaceholder')}" maxlength="5" data-bookmark-key="${fullIndex}" data-field="shortcut">
            <div class="bookmark-icon-upload">
                <input type="file" id="bookmark-icon-${fullIndex}" name="bookmark-icon-${fullIndex}" accept="image/*" style="display: none;" data-bookmark-key="${fullIndex}">
                <button type="button" class="btn btn-secondary btn-small ${bookmark.icon ? 'has-icon' : ''}" onclick="document.getElementById('bookmark-icon-${fullIndex}').click()" title="${this.t('config.uploadIconTooltip')}">↑</button>
                ${bookmark.icon ? `<button type="button" class="btn btn-danger btn-small btn-clear-icon" onclick="window.configBookmarks.clearIcon(${fullIndex})" title="${this.t('config.clearIcon')}">×</button>` : ''}
            </div>
            <select id="bookmark-category-${fullIndex}" name="bookmark-category-${fullIndex}" data-bookmark-key="${fullIndex}" data-field="category">
                <option value="">${this.t('config.noCategory')}</option>
                ${categoryOptions}
            </select>
            <div class="bookmark-status-toggle">
                <label class="checkbox-label">
                    <input type="checkbox" id="bookmark-checkStatus-${fullIndex}" name="bookmark-checkStatus-${fullIndex}" ${bookmark.checkStatus ? 'checked' : ''} data-bookmark-key="${fullIndex}" data-field="checkStatus">
                    <span class="checkbox-text">${this.t('config.status')}</span>
                </label>
            </div>
            <label class="checkbox-label bookmark-pin-label">
                <input type="checkbox" id="bookmark-pinned-${fullIndex}" data-bookmark-key="${fullIndex}" data-field="pinned" ${bookmark.pinned ? 'checked' : ''}>
                <span class="checkbox-text">Pin</span>
            </label>
            <button type="button" class="btn btn-danger" onclick="configManager.removeBookmark(${fullIndex})">${this.t('config.remove')}</button>
        `;

        // Store reference to the actual bookmark object
        div._bookmarkRef = bookmark;
        
        // Add event listeners for field changes
        const inputs = div.querySelectorAll('input, select');
        inputs.forEach(input => {
            const eventType = input.type === 'text' || input.type === 'url' ? 'input' : 'change';
            input.addEventListener(eventType, (e) => {
                const field = e.target.getAttribute('data-field');
                
                // Update the bookmark object directly via stored reference
                if (field === 'checkStatus') {
                    bookmark[field] = e.target.checked;
                } else if (field === 'pinned') {
                    bookmark[field] = e.target.checked;
                } else {
                    bookmark[field] = e.target.value;
                }
                
                // Convert shortcut to uppercase and allow only letters (no numbers)
                if (field === 'shortcut') {
                    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                    bookmark[field] = e.target.value;
                }

                if (field === 'url') {
                    const duplicate = bookmarks.some((otherBookmark, otherIndex) => otherIndex !== fullIndex && (otherBookmark.url || '').trim().toLowerCase() === e.target.value.trim().toLowerCase());
                    e.target.classList.toggle('duplicate-url', duplicate);
                    if (duplicate && window.configManager && window.configManager.ui) {
                        window.configManager.ui.showNotification('Duplicate URL detected.', 'warning');
                    }
                }
            });
        });

        const selectCheckbox = div.querySelector('.bookmark-select-checkbox');
        if (selectCheckbox) {
            selectCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedBookmarkIndexes.add(fullIndex);
                } else {
                    this.selectedBookmarkIndexes.delete(fullIndex);
                }
                this.updateBulkSelectionToolbar();
            });
        }

        // Add event listener for icon upload
        const iconInput = div.querySelector(`#bookmark-icon-${fullIndex}`);
        const iconButton = div.querySelector('.bookmark-icon-upload button');
        if (iconInput && iconButton) {
            iconInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const formData = new FormData();
                    formData.append('icon', file);

                    try {
                        const response = await fetch('/api/icon', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();
                        if (result.status === 'success') {
                            bookmark.icon = result.icon;
                            iconButton.classList.add('has-icon');
                            
                            // Add clear button if it doesn't exist
                            let clearButton = div.querySelector('.btn-clear-icon');
                            if (!clearButton) {
                                clearButton = document.createElement('button');
                                clearButton.type = 'button';
                                clearButton.className = 'btn btn-danger btn-small btn-clear-icon';
                                clearButton.onclick = () => window.configBookmarks.clearIcon(fullIndex);
                                clearButton.title = window.configBookmarks ? window.configBookmarks.t('config.clearIcon') : 'Clear icon';
                                clearButton.textContent = '×';
                                iconButton.parentNode.appendChild(clearButton);
                            }
                        } else {
                            alert('Error uploading icon');
                        }
                    } catch (error) {
                        console.error('Error uploading icon:', error);
                        alert('Error uploading icon');
                    }
                }
            });
        }

        // Initialize custom select for the category dropdown
        const selectElement = div.querySelector('select');
        if (selectElement && typeof CustomSelect !== 'undefined') {
            // Mark as initialized to prevent double initialization
            selectElement.dataset.customSelectInit = 'true';
            new CustomSelect(selectElement);
        }

        return div;
    }

    /**
     * Initialize bookmark reordering
     * @param {Array} bookmarks
     * @param {Function} onReorder - Callback when reorder happens
     */
    initReorder(bookmarks, onReorder, options = {}) {
        const filterCategory = options.filterCategory || this.currentFilterCategory;

        // Destroy previous instance if it exists
        if (this.bookmarkReorder) {
            this.bookmarkReorder.destroy();
        }

        const container = document.getElementById('bookmarks-list');
        if (!container || container.querySelectorAll('.bookmark-item').length === 0) {
            return;
        }
        
        // Initialize drag-and-drop reordering
        this.bookmarkReorder = new DragReorder({
            container: '#bookmarks-list',
            itemSelector: '.bookmark-item',
            handleSelector: '.js-drag-handle',
            onReorder: (newOrder) => {
                const reorderedScopedBookmarks = [];
                newOrder.forEach((item) => {
                    const bookmark = item.element._bookmarkRef;
                    if (bookmark) {
                        reorderedScopedBookmarks.push(bookmark);
                    }
                });

                if (filterCategory === '__all__') {
                    onReorder(reorderedScopedBookmarks);
                    return;
                }

                const nextBookmarks = [];
                let scopeIndex = 0;
                bookmarks.forEach((bookmark) => {
                    const inScope = (filterCategory === '__none__')
                        ? !bookmark.category
                        : bookmark.category === filterCategory;

                    if (inScope) {
                        nextBookmarks.push(reorderedScopedBookmarks[scopeIndex] || bookmark);
                        scopeIndex += 1;
                    } else {
                        nextBookmarks.push(bookmark);
                    }
                });

                onReorder(nextBookmarks);
            }
        });

        this.setupKeyboardReorder(bookmarks, onReorder, { filterCategory });
    }

    setupKeyboardReorder(bookmarks, onReorder, options = {}) {
        const container = document.getElementById('bookmarks-list');
        if (!container) {
            return;
        }

        if (this.keyboardReorderHandler) {
            container.removeEventListener('keydown', this.keyboardReorderHandler);
        }

        const filterCategory = options.filterCategory || this.currentFilterCategory;

        this.keyboardReorderHandler = (e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) {
                return;
            }

            const bookmarkItem = e.target.closest('.bookmark-item');
            if (!bookmarkItem) {
                return;
            }

            const currentIndex = parseInt(bookmarkItem.getAttribute('data-bookmark-index'), 10);
            if (Number.isNaN(currentIndex)) {
                return;
            }

            const scopedIndexes = bookmarks
                .map((bookmark, index) => ({ bookmark, index }))
                .filter(({ bookmark }) => {
                    if (filterCategory === '__all__') {
                        return true;
                    }
                    if (filterCategory === '__none__') {
                        return !bookmark.category;
                    }
                    return bookmark.category === filterCategory;
                })
                .map(({ index }) => index);

            const scopedPosition = scopedIndexes.indexOf(currentIndex);
            if (scopedPosition === -1) {
                return;
            }

            const targetPosition = e.key === 'ArrowUp' ? scopedPosition - 1 : scopedPosition + 1;
            if (targetPosition < 0 || targetPosition >= scopedIndexes.length) {
                return;
            }

            e.preventDefault();

            const targetIndex = scopedIndexes[targetPosition];
            const nextBookmarks = [...bookmarks];
            const temp = nextBookmarks[currentIndex];
            nextBookmarks[currentIndex] = nextBookmarks[targetIndex];
            nextBookmarks[targetIndex] = temp;
            onReorder(nextBookmarks, {
                focusIndex: targetIndex,
                highlightIndex: targetIndex
            });
        };

        container.addEventListener('keydown', this.keyboardReorderHandler);
    }

    /**
     * Add a new bookmark
     * @param {Array} bookmarks
     * @returns {Object} - The new bookmark
     */
    add(bookmarks) {
        const newBookmark = {
            name: `${this.t('config.newBookmarkPrefix')} ${bookmarks.length + 1}`,
            url: 'https://example.com',
            shortcut: '',
            category: '',
            pinned: false,
            checkStatus: false
        };
        bookmarks.push(newBookmark);
        return newBookmark;
    }

    /**
     * Remove a bookmark (with confirmation)
     * @param {Array} bookmarks
     * @param {number} index
     * @returns {Promise<boolean>} - Whether the bookmark was removed
     */
    async remove(bookmarks, index) {
        const confirmed = await window.AppModal.danger({
            title: this.t('config.removeBookmarkTitle'),
            message: this.t('config.removeBookmarkMessage'),
            confirmText: this.t('config.remove'),
            cancelText: this.t('config.cancel')
        });
        
        if (!confirmed) {
            return false;
        }
        
        bookmarks.splice(index, 1);
        this.selectedBookmarkIndexes.delete(index);
        return true;
    }

    getSelectedIndexes() {
        return Array.from(this.selectedBookmarkIndexes).sort((a, b) => a - b);
    }

    clearSelection() {
        this.selectedBookmarkIndexes.clear();
        this.updateBulkSelectionToolbar();
        document.querySelectorAll('.bookmark-select-checkbox').forEach((checkbox) => {
            checkbox.checked = false;
        });
    }

    selectAllVisible() {
        document.querySelectorAll('.bookmark-item').forEach((item) => {
            const index = parseInt(item.getAttribute('data-bookmark-index'), 10);
            const checkbox = item.querySelector('.bookmark-select-checkbox');
            if (!Number.isNaN(index) && checkbox) {
                this.selectedBookmarkIndexes.add(index);
                checkbox.checked = true;
            }
        });
        this.updateBulkSelectionToolbar();
    }

    updateBulkSelectionToolbar() {
        const count = this.selectedBookmarkIndexes.size;
        ['bulk-delete-bookmarks-btn', 'bulk-apply-category-btn', 'bulk-toggle-pin-btn'].forEach((buttonId) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = count === 0;
            }
        });

        const deleteButton = document.getElementById('bulk-delete-bookmarks-btn');
        if (deleteButton) {
            deleteButton.textContent = count > 0 ? `Delete (${count})` : 'Delete';
        }

        const moveButton = document.getElementById('bulk-apply-category-btn');
        if (moveButton) {
            moveButton.textContent = count > 0 ? `Move category (${count})` : 'Move category';
        }

        const pinButton = document.getElementById('bulk-toggle-pin-btn');
        if (pinButton) {
            pinButton.textContent = count > 0 ? `Toggle pin (${count})` : 'Toggle pin';
        }
    }

    async bulkDelete(bookmarks) {
        const indexes = this.getSelectedIndexes();
        if (indexes.length === 0) return false;

        const confirmed = await window.AppModal.danger({
            title: 'Delete selected bookmarks',
            message: `Delete ${indexes.length} selected bookmarks?`,
            confirmText: this.t('config.remove'),
            cancelText: this.t('config.cancel')
        });

        if (!confirmed) return false;

        for (let i = indexes.length - 1; i >= 0; i--) {
            bookmarks.splice(indexes[i], 1);
        }
        this.clearSelection();
        return true;
    }

    bulkUpdateCategory(bookmarks, categoryId) {
        this.getSelectedIndexes().forEach((index) => {
            if (bookmarks[index]) {
                bookmarks[index].category = categoryId;
            }
        });
        this.clearSelection();
    }

    bulkTogglePin(bookmarks) {
        this.getSelectedIndexes().forEach((index) => {
            if (bookmarks[index]) {
                bookmarks[index].pinned = !bookmarks[index].pinned;
            }
        });
        this.clearSelection();
    }

    /**
     * Clear the icon from a bookmark
     * @param {number} index - The index of the bookmark to clear the icon from
     */
    clearIcon(index) {
        // Find the bookmark element
        const bookmarkElement = document.querySelector(`[data-bookmark-index="${index}"]`);
        if (!bookmarkElement || !bookmarkElement._bookmarkRef) {
            return;
        }

        const bookmark = bookmarkElement._bookmarkRef;
        
        // Clear the icon
        bookmark.icon = '';
        
        // Update the button styling
        const iconButton = bookmarkElement.querySelector('.bookmark-icon-upload button');
        if (iconButton) {
            iconButton.classList.remove('has-icon');
        }
        
        // Remove the clear button
        const clearButton = bookmarkElement.querySelector('.btn-clear-icon');
        if (clearButton) {
            clearButton.remove();
        }
    }
}

// Export for use in other modules
window.ConfigBookmarks = ConfigBookmarks;
