/**
 * DragReorder - A simple drag-and-drop reordering system using native HTML5 API
 * 
 * Usage:
 * const reorder = new DragReorder({
 *   container: '#my-list',           // Container selector
 *   itemSelector: '.my-item',        // Item selector (optional, defaults to children)
 *   handleSelector: '.drag-handle',  // Drag handle selector (optional, makes entire item draggable if not provided)
 *   onReorder: (newOrder) => {       // Callback when order changes
 *     console.log('New order:', newOrder);
 *   }
 * });
 */

class DragReorder {
    constructor(options = {}) {
        this.container = typeof options.container === 'string' 
            ? document.querySelector(options.container) 
            : options.container;
        
        if (!this.container) {
            console.error('DragReorder: Container not found');
            return;
        }

        this.itemSelector = options.itemSelector || null;
        this.handleSelector = options.handleSelector || null;
        this.onReorder = options.onReorder || null;
        this.itemClass = 'reorder-item';
        this.selected = null;
        this.dragStartMeta = null;
        this.isTouch = 'ontouchstart' in window;
        this.placeholder = null;
        
        // Bind handlers
        this.touchStartHandler = (e) => this.touchStart(e);
        this.touchMoveHandler = (e) => this.touchMove(e);
        this.touchEndHandler = (e) => this.touchEnd(e);
        this.preventDrop = (e) => e.preventDefault();
        this.containerDragOverHandler = (e) => this.dragOverContainer(e);
        
        this.init();
    }

    init() {
        // Add reorder-container class to container
        this.container.classList.add('reorder-container');
        if (!window.__dragReorderState) {
            window.__dragReorderState = { selected: null };
        }
        if (!window.__dragReorderState.placeholder) {
            window.__dragReorderState.placeholder = null;
        }
        
        // Initialize items
        this.refreshItems();
    }

    refreshItems() {
        // Add item class and idle class, make handles draggable or add touch listeners
        this.getAllItems().forEach(item => {
            if (!item.classList.contains(this.itemClass)) {
                item.classList.add(this.itemClass);
            }
            if (!item.classList.contains('is-idle')) {
                item.classList.add('is-idle');
            }
            const element = this.handleSelector ? item.querySelector(this.handleSelector) : item;
            if (element) {
                if (this.isTouch) {
                    element.addEventListener('touchstart', this.touchStartHandler, { passive: false });
                    element.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
                    element.addEventListener('touchend', this.touchEndHandler);
                } else {
                    element.draggable = true;
                    element.ondragstart = (e) => this.dragStart(e);
                    element.ondragend = (e) => this.dragEnd(e);
                }
            }
            // Add dragover to item for mouse drag
            if (!this.isTouch) {
                item.ondragover = (e) => this.dragOver(e);
            }
        });

        if (!this.isTouch) {
            this.container.ondragover = this.containerDragOverHandler;
        }
    }

    dragStart(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
        this.selected = e.target.closest(`.${this.itemClass}`);
        this.dragStartMeta = this.getItemMeta(this.selected);
        window.__dragReorderState.selected = this.selected;
        this.removeAllPlaceholders();
        this.selected.classList.remove('is-idle');
        this.selected.classList.add('is-draggable');
        
        // Prevent scrolling on touch devices
        this.disablePageScroll();
        
        // Prevent dropping anywhere else
        document.addEventListener('dragover', this.preventDrop, { passive: false });
    }

    dragOver(e) {
        e.preventDefault();
        const activeSelected = this.getSelectedItem();
        if (!activeSelected) return;

        const targetItem = e.target.closest(`.${this.itemClass}`);
        if (!targetItem || targetItem === activeSelected) return;

        this.ensurePlaceholder();
        targetItem.parentNode.insertBefore(this.placeholder, targetItem);

        if (this.isBefore(activeSelected, targetItem)) {
            targetItem.parentNode.insertBefore(activeSelected, targetItem);
        } else {
            targetItem.parentNode.insertBefore(activeSelected, targetItem.nextSibling);
        }
    }

    dragOverContainer(e) {
        const activeSelected = this.getSelectedItem();
        if (!activeSelected) return;

        const targetItem = e.target.closest(`.${this.itemClass}`);
        if (targetItem) {
            return;
        }

        e.preventDefault();
        if (activeSelected.parentNode !== this.container) {
            this.container.appendChild(activeSelected);
        }
        this.ensurePlaceholder();
        this.container.appendChild(this.placeholder);
    }

    dragEnd() {
        const activeSelected = this.getSelectedItem();
        if (!activeSelected) {
            return;
        }

        activeSelected.classList.remove('is-draggable');
        activeSelected.classList.add('is-idle');
        activeSelected.classList.add('bookmark-move-in');
        requestAnimationFrame(() => {
            setTimeout(() => activeSelected.classList.remove('bookmark-move-in'), 180);
        });
        this.removeAllPlaceholders();
        this.enablePageScroll();
        document.removeEventListener('dragover', this.preventDrop);
        const reorderDetails = {
            from: this.dragStartMeta || this.getItemMeta(activeSelected),
            to: this.getItemMeta(activeSelected)
        };
        this.selected = null;
        window.__dragReorderState.selected = null;
        this.dragStartMeta = null;
        // Call the onReorder callback with the new order
        if (this.onReorder && typeof this.onReorder === 'function') {
            this.onReorder(this.getNewOrder(), reorderDetails);
        }
    }

    touchStart(e) {
        e.preventDefault();
        this.selected = e.target.closest(`.${this.itemClass}`);
        this.dragStartMeta = this.getItemMeta(this.selected);
        window.__dragReorderState.selected = this.selected;
        this.removeAllPlaceholders();
        this.selected.classList.remove('is-idle');
        this.selected.classList.add('is-draggable');
        this.disablePageScroll();
    }
    touchMove(e) {
        e.preventDefault();
        const activeSelected = this.getSelectedItem();
        if (!activeSelected) return;
        const touch = e.touches[0];
        const pointElement = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = pointElement ? pointElement.closest(`.${this.itemClass}`) : null;
        const targetContainer = pointElement ? pointElement.closest('.bookmarks-list[data-category-id]') : null;

        if (targetItem && targetItem !== activeSelected) {
            this.ensurePlaceholder();
            targetItem.parentNode.insertBefore(this.placeholder, targetItem);
            if (this.isBefore(activeSelected, targetItem)) {
                targetItem.parentNode.insertBefore(activeSelected, targetItem);
            } else {
                targetItem.parentNode.insertBefore(activeSelected, targetItem.nextSibling);
            }
        } else if (targetContainer) {
            if (targetContainer !== activeSelected.parentNode) {
                targetContainer.appendChild(activeSelected);
            }
            this.ensurePlaceholder();
            targetContainer.appendChild(this.placeholder);
        }
    }

    touchEnd(e) {
        const activeSelected = this.getSelectedItem();
        if (!activeSelected) {
            return;
        }

        activeSelected.classList.remove('is-draggable');
        activeSelected.classList.add('is-idle');
        activeSelected.classList.add('bookmark-move-in');
        requestAnimationFrame(() => {
            setTimeout(() => activeSelected.classList.remove('bookmark-move-in'), 180);
        });
        this.removeAllPlaceholders();
        this.enablePageScroll();
        const reorderDetails = {
            from: this.dragStartMeta || this.getItemMeta(activeSelected),
            to: this.getItemMeta(activeSelected)
        };
        this.selected = null;
        window.__dragReorderState.selected = null;
        this.dragStartMeta = null;
        // Call the onReorder callback with the new order
        if (this.onReorder && typeof this.onReorder === 'function') {
            this.onReorder(this.getNewOrder(), reorderDetails);
        }
    }

    isBefore(el1, el2) {
        let cur;
        if (el2.parentNode === el1.parentNode) {
            for (cur = el1.previousSibling; cur; cur = cur.previousSibling) {
                if (cur === el2) return true;
            }
        }
        return false;
    }

    disablePageScroll() {
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
    }

    enablePageScroll() {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
    }

    getAllItems() {
        if (this.itemSelector) {
            return Array.from(this.container.querySelectorAll(this.itemSelector));
        }
        return Array.from(this.container.children);
    }

    getSelectedItem() {
        if (this.selected) {
            return this.selected;
        }
        if (window.__dragReorderState && window.__dragReorderState.selected) {
            return window.__dragReorderState.selected;
        }
        return null;
    }

    getItemMeta(item) {
        if (!item) {
            return { categoryId: '', index: -1 };
        }
        const parent = item.closest('.bookmarks-list[data-category-id]');
        const categoryId = parent ? (parent.getAttribute('data-category-id') || '') : '';
        const siblings = parent ? Array.from(parent.querySelectorAll(`.${this.itemClass}`)) : [];
        return {
            categoryId,
            index: siblings.indexOf(item)
        };
    }

    getNewOrder() {
        const items = this.getAllItems();
        return items.map((item, index) => ({
            element: item,
            index: index,
            dataIndex: item.getAttribute('data-index') || index
        }));
    }

    ensurePlaceholder() {
        if (!window.__dragReorderState.placeholder) {
            const placeholder = document.createElement('div');
            placeholder.className = 'bookmark-drop-placeholder';
            placeholder.setAttribute('aria-hidden', 'true');
            window.__dragReorderState.placeholder = placeholder;
        }
        this.placeholder = window.__dragReorderState.placeholder;
    }

    removePlaceholder() {
        const placeholder = window.__dragReorderState ? window.__dragReorderState.placeholder : null;
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder);
        }
    }

    removeAllPlaceholders() {
        document.querySelectorAll('.bookmark-drop-placeholder').forEach((node) => {
            if (node && node.parentNode) {
                node.parentNode.removeChild(node);
            }
        });
    }

    // Public method to destroy the instance
    destroy() {
        this.enablePageScroll();
        this.removeAllPlaceholders();
        this.container.classList.remove('reorder-container');
        
        // Remove classes and listeners from items
        this.getAllItems().forEach(item => {
            item.classList.remove(this.itemClass, 'is-idle', 'is-draggable');
            const element = this.handleSelector ? item.querySelector(this.handleSelector) : item;
            if (element) {
                if (this.isTouch) {
                    element.removeEventListener('touchstart', this.touchStartHandler);
                    element.removeEventListener('touchmove', this.touchMoveHandler);
                    element.removeEventListener('touchend', this.touchEndHandler);
                } else {
                    element.draggable = false;
                    element.ondragstart = null;
                    element.ondragend = null;
                }
            }
            if (!this.isTouch) {
                item.ondragover = null;
            }
        });

        if (!this.isTouch) {
            this.container.ondragover = null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DragReorder;
}
