/**
 * Quick Add Widget
 * Mini form on dashboard for rapid bookmark creation
 */

class QuickAddWidget {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = null;
        this.isOpen = false;
        this.shortcutBound = false;
        this.init();
    }

    init() {
        this.createWidget();
        this.attachEventListeners();
    }

    createWidget() {
        const html = `
            <div class="quick-add-widget" style="display: none;">
                <div class="quick-add-header">
                    <h3>Quick Add Bookmark</h3>
                    <button class="quick-add-close" type="button">×</button>
                </div>
                <form class="quick-add-form">
                    <input type="text" placeholder="Bookmark name" class="quick-add-name" required>
                    <input type="url" placeholder="URL" class="quick-add-url" required>
                    <input type="text" placeholder="Shortcut (optional)" class="quick-add-shortcut" maxlength="5">
                    <select class="quick-add-category">
                        <option value="">No category</option>
                    </select>
                    <button type="submit" class="btn btn-primary">Add Bookmark</button>
                </form>
            </div>
        `;

        // Mount outside #dashboard-layout because that node is rerendered and cleared.
        const dashboardLayout = document.getElementById('dashboard-layout');
        if (dashboardLayout && dashboardLayout.parentNode) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            this.container = tempDiv.firstElementChild;
            dashboardLayout.parentNode.insertBefore(this.container, dashboardLayout);
            this.updateCategories();
        }
    }

    attachEventListeners() {
        const closeBtn = this.container?.querySelector('.quick-add-close');
        const form = this.container?.querySelector('.quick-add-form');
        const toggleBtn = document.querySelector('[data-quick-add-toggle]');

        closeBtn?.addEventListener('click', () => this.toggle());
        form?.addEventListener('submit', (e) => this.handleSubmit(e));
        toggleBtn?.addEventListener('click', () => this.toggle());

        // Keyboard shortcut: Ctrl+Shift+A to toggle
        if (!this.shortcutBound) {
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
                    e.preventDefault();
                    this.toggle();
                }
            });
            this.shortcutBound = true;
        }
    }

    toggle() {
        // Defensive remount in case another render cycle removed the widget.
        if (!this.container || !document.body.contains(this.container)) {
            this.createWidget();
            this.attachEventListeners();
        }

        this.isOpen = !this.isOpen;
        if (this.container) {
            this.container.style.display = this.isOpen ? 'block' : 'none';
            if (this.isOpen) {
                this.container.querySelector('.quick-add-name')?.focus();
            }
        }
    }

    updateCategories() {
        const select = this.container?.querySelector('.quick-add-category');
        if (select) {
            select.innerHTML = '<option value="">No category</option>';
            this.dashboard.categories?.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                select.appendChild(option);
            });
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        const name = this.container.querySelector('.quick-add-name').value;
        const url = this.container.querySelector('.quick-add-url').value;
        const shortcut = this.container.querySelector('.quick-add-shortcut').value.toUpperCase().replace(/[^A-Z]/g, '');
        const category = this.container.querySelector('.quick-add-category').value;

        try {
            const response = await fetch('/api/bookmarks/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page: Number(this.dashboard.currentPageId) || 1,
                    bookmark: {
                        name,
                        url,
                        shortcut,
                        category,
                        pinned: false,
                        checkStatus: false,
                        icon: ''
                    }
                })
            });

            if (response.ok) {
                await this.dashboard.loadPageBookmarks(this.dashboard.currentPageId);
                this.toggle();
                this.container.querySelector('form').reset();
                this.dashboard.showNotification('Bookmark added!', 'success');
            } else if (response.status === 409) {
                this.dashboard.showNotification('Duplicate bookmark URL.', 'error');
            } else {
                this.dashboard.showNotification('Failed to add bookmark.', 'error');
            }
        } catch (error) {
            console.error('Error adding bookmark:', error);
            this.dashboard.showNotification('Error adding bookmark', 'error');
        }
    }
}
