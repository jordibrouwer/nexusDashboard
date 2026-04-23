/**
 * Keyboard Shortcuts Help Overlay
 * Show help on pressing ! or Escape
 */

class KeyboardHelp {
    constructor() {
        this.overlay = null;
        this.isVisible = false;
        this.init();
    }

    init() {
        this.createOverlay();
        this.attachEventListeners();
    }

    createOverlay() {
        const html = `
            <div class="keyboard-help-overlay" style="display: none;">
                <div class="keyboard-help-container">
                    <div class="keyboard-help-header">
                        <h2>⌨️ Keyboard Shortcuts</h2>
                        <button class="keyboard-help-close" type="button">×</button>
                    </div>
                    <div class="keyboard-help-content">
                        <div class="keyboard-help-section">
                            <h3>Navigation</h3>
                            <ul>
                                <li><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> - Navigate bookmarks</li>
                                <li><kbd>Enter</kbd> / <kbd>Space</kbd> - Open selected bookmark</li>
                                <li><kbd>Shift</kbd> <kbd>←</kbd> / <kbd>→</kbd> - Change pages</li>
                                <li><kbd>Shift</kbd> <kbd>Alt</kbd> <kbd>↑</kbd> / <kbd>↓</kbd> - Move bookmark (config)</li>
                            </ul>
                        </div>
                        <div class="keyboard-help-section">
                            <h3>Search & Shortcuts</h3>
                            <ul>
                                <li><kbd>/</kbd> - Open fuzzy search</li>
                                <li><kbd>A-Z</kbd> - Quick shortcut search</li>
                                <li><kbd>Ctrl</kbd> <kbd>K</kbd> - Command palette</li>
                                <li><kbd>Escape</kbd> - Close search/modal or undo the latest reorder</li>
                            </ul>
                        </div>
                        <div class="keyboard-help-section">
                            <h3>Quick Actions</h3>
                            <ul>
                                <li><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>A</kbd> - Quick add bookmark</li>
                                <li><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>,</kbd> - Open config</li>
                                <li><kbd>!</kbd> - Show this help</li>
                                <li><kbd>Ctrl</kbd> <kbd>Z</kbd> / <kbd>Y</kbd> - Undo/Redo (config)</li>
                            </ul>
                        </div>
                        <div class="keyboard-help-section">
                            <h3>New Features</h3>
                            <ul>
                                <li><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>A</kbd> - Open Quick Add widget</li>
                                <li><kbd>Hover</kbd> - Load bookmark preview metadata</li>
                                <li><kbd>Bookmarks tab</kbd> - Analytics, duplicate warnings, bulk actions</li>
                                <li><kbd>Theme</kbd> - Auto dark mode, opacity, and font weight</li>
                                <li><kbd>Layout</kbd> - Presets and saved search commands</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        this.overlay = tempDiv.firstElementChild;
        document.body.appendChild(this.overlay);
    }

    attachEventListeners() {
        const closeBtn = this.overlay.querySelector('.keyboard-help-close');
        closeBtn?.addEventListener('click', () => this.hide());

        document.addEventListener('keydown', (e) => {
            const target = e.target;
            const isTypingContext = Boolean(
                target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable
                )
            );

            const quickAddOpen = Boolean(
                document.querySelector('.quick-add-widget') &&
                document.querySelector('.quick-add-widget').style.display !== 'none'
            );

            // Do not trigger help while typing or when quick add widget is open
            if (isTypingContext || quickAddOpen) {
                return;
            }

            // ! to show help
            if (e.key === '!' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                this.toggle();
            }
            // Escape to hide
            if (e.code === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Click outside to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });
    }

    toggle() {
        this.isVisible ? this.hide() : this.show();
    }

    show() {
        this.overlay.style.display = 'flex';
        this.isVisible = true;
    }

    hide() {
        this.overlay.style.display = 'none';
        this.isVisible = false;
    }
}
