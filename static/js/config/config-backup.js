/**
 * Backup Module
 * Handles data backup and export functionality
 */

class ConfigBackup {
    constructor(t) {
        this.t = t; // Translation function
        this.init();
    }

    /**
     * Initialize the backup functionality
     */
    init() {
        const backupBtn = document.getElementById('backup-btn');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => this.createBackup());
        }

        const csvExportBtn = document.getElementById('csv-export-btn');
        if (csvExportBtn) {
            csvExportBtn.addEventListener('click', () => this.exportBookmarksCsv());
        }

        const csvImportBtn = document.getElementById('csv-import-btn');
        const csvImportFile = document.getElementById('csv-import-file');
        if (csvImportBtn && csvImportFile) {
            csvImportBtn.addEventListener('click', () => csvImportFile.click());
            csvImportFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleCsvImportFile(file);
                }
            });
        }

        // Backup info button
        const backupInfoBtn = document.getElementById('backup-info-btn');
        if (backupInfoBtn) {
            backupInfoBtn.addEventListener('click', () => {
                if (window.AppModal) {
                    window.AppModal.alert({
                        title: this.t('config.backupInfoTitle'),
                        message: this.t('config.backupInfo'),
                        confirmText: this.t('config.backupInfoConfirm')
                    });
                }
            });
        }

        // Import functionality
        const importBtn = document.getElementById('import-btn');
        const importFile = document.getElementById('import-file');
        if (importBtn && importFile) {
            importBtn.addEventListener('click', () => {
                importFile.click();
            });

            importFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleImportFile(file);
                }
            });
        }

        // Import info button
        const importInfoBtn = document.getElementById('import-info-btn');
        if (importInfoBtn) {
            importInfoBtn.addEventListener('click', () => {
                if (window.AppModal) {
                    const importInfo = this.t('config.importInfo');
                    const parts = importInfo.split('\n\n');
                    const htmlMessage = parts[0] + '<br><br><span class="danger">' + parts[1] + '</span>';
                    window.AppModal.alert({
                        title: this.t('config.importInfoTitle'),
                        htmlMessage: htmlMessage,
                        confirmText: this.t('config.importInfoConfirm')
                    });
                }
            });
        }
    }

    /**
     * Create and download a backup of all data
     */
    async createBackup() {
        const backupBtn = document.getElementById('backup-btn');
        if (!backupBtn) return;

        try {
            // Disable button to prevent multiple clicks
            backupBtn.disabled = true;

            // Fetch the backup
            const response = await fetch('/api/backup', {
                method: 'GET',
            });

            if (!response.ok) {
                throw new Error(`Backup failed: ${response.statusText}`);
            }

            // Create download
            const now = new Date();
            const timestamp = now.toISOString().replace('T', '_').replace(/\..+/, '').replace(':', '-').replace(':', '-');
            const filename = `nexusdashboard-backup-${timestamp}.zip`;
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Show success message
            if (typeof configManager !== 'undefined' && configManager.ui) {
                configManager.ui.showNotification(this.t('config.backupCreated') || 'Backup created successfully!', 'success');
            }

        } catch (error) {
            console.error('Backup error:', error);
            // Show error message
            if (typeof configManager !== 'undefined' && configManager.ui) {
                configManager.ui.showNotification(this.t('config.backupError') || 'Failed to create backup. Please try again.', 'error');
            }
        } finally {
            // Re-enable button
            backupBtn.disabled = false;
        }
    }

    exportBookmarksCsv() {
        if (typeof configManager === 'undefined' || !configManager.bookmarksData) {
            return;
        }

        const header = ['name', 'url', 'shortcut', 'category', 'pinned', 'checkStatus', 'lastOpened', 'lastChecked', 'lastError'];
        const rows = configManager.bookmarksData.map((bookmark) => [
            bookmark.name || '',
            bookmark.url || '',
            bookmark.shortcut || '',
            bookmark.category || '',
            bookmark.pinned ? 'true' : 'false',
            bookmark.checkStatus ? 'true' : 'false',
            bookmark.lastOpened || ''
            ,bookmark.lastChecked || ''
            ,bookmark.lastError || ''
        ]);

        const csv = [header, ...rows]
            .map((row) => row.map((value) => this.escapeCsvValue(String(value))).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const pageId = configManager.currentPageId || 1;
        a.href = url;
        a.download = `nexusdashboard-bookmarks-page-${pageId}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        if (configManager.ui) {
            configManager.ui.showNotification('CSV exported successfully.', 'success');
        }
    }

    async handleCsvImportFile(file) {
        try {
            if (!file.name.toLowerCase().endsWith('.csv')) {
                if (configManager.ui) {
                    configManager.ui.showNotification('Please select a CSV file.', 'error');
                }
                return;
            }

            const text = await file.text();
            const importedBookmarks = this.parseCsvBookmarks(text);

            if (importedBookmarks.length === 0) {
                if (configManager.ui) {
                    configManager.ui.showNotification('CSV file did not contain valid bookmarks.', 'error');
                }
                return;
            }

            const confirmed = window.AppModal ? await window.AppModal.confirm({
                title: 'Import CSV',
                message: `Import ${importedBookmarks.length} bookmarks into the current page? Existing bookmarks will be replaced.`,
                confirmText: 'Import',
                cancelText: 'Cancel',
                confirmClass: 'danger'
            }) : true;

            if (!confirmed) {
                return;
            }

            const currentPageId = configManager.currentPageId || 1;
            await configManager.data.saveBookmarks(importedBookmarks, currentPageId);
            configManager.bookmarksData = importedBookmarks;
            configManager.refreshBookmarksFilterOptions();
            configManager.refreshBookmarksList();

            if (configManager.ui) {
                configManager.ui.showNotification('CSV imported successfully.', 'success');
            }
        } catch (error) {
            console.error('CSV import error:', error);
            if (configManager.ui) {
                configManager.ui.showNotification('Failed to import CSV file.', 'error');
            }
        } finally {
            const csvImportFile = document.getElementById('csv-import-file');
            if (csvImportFile) {
                csvImportFile.value = '';
            }
        }
    }

    parseCsvBookmarks(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            return [];
        }

        const headers = this.parseCsvLine(lines[0]).map(header => header.trim().toLowerCase());
        const requiredHeaders = ['name', 'url'];
        if (!requiredHeaders.every(header => headers.includes(header))) {
            return [];
        }

        const bookmarks = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCsvLine(lines[i]);
            if (values.length === 0) {
                continue;
            }

            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });

            if (!row.url) {
                continue;
            }

            bookmarks.push({
                name: row.name || row.url,
                url: row.url,
                shortcut: (row.shortcut || '').toUpperCase().replace(/[^A-Z]/g, ''),
                category: row.category || '',
                pinned: String(row.pinned || '').toLowerCase() === 'true',
                checkStatus: String(row.checkstatus || '').toLowerCase() === 'true',
                lastOpened: row.lastopened ? Number(row.lastopened) || 0 : 0,
                lastChecked: row.lastchecked ? Number(row.lastchecked) || 0 : 0,
                lastError: row.lasterror || '',
                icon: ''
            });
        }

        return bookmarks;
    }

    parseCsvLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current);
        return values;
    }

    escapeCsvValue(value) {
        if (value.includes('"') || value.includes(',') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    /**
     * Handle the selected import file
     * @param {File} file
     */
    async handleImportFile(file) {
        try {
            if (!file.name.endsWith('.zip')) {
                if (typeof configManager !== 'undefined' && configManager.ui) {
                    configManager.ui.showNotification(this.t('config.importInvalidFile'), 'error');
                }
                return;
            }

            const zip = await JSZip.loadAsync(file);
            const files = Object.keys(zip.files);

            // Check for required files
            const requiredFiles = ['settings.json', 'colors.json', 'pages.json'];
            const hasBookmarks = files.some(filename => filename.startsWith('bookmarks-') && filename.endsWith('.json'));

            const hasRequiredFiles = requiredFiles.every(requiredFile => 
                files.includes(requiredFile)
            );

            if (!hasRequiredFiles || !hasBookmarks) {
                if (typeof configManager !== 'undefined' && configManager.ui) {
                    configManager.ui.showNotification(this.t('config.importInvalidFile'), 'error');
                }
                return;
            }

            // Clear the file input immediately after validation
            const importFile = document.getElementById('import-file');
            if (importFile) {
                importFile.value = '';
            }

            // Show confirmation modal
            if (window.AppModal) {
                const confirmed = await window.AppModal.confirm({
                    title: this.t('config.importConfirmTitle'),
                    message: this.t('config.importConfirmMessage'),
                    confirmText: this.t('config.importConfirm'),
                    cancelText: this.t('config.cancelImport'),
                    confirmClass: 'danger'
                });

                if (confirmed) {
                    await this.performImport(zip);
                }
            }

        } catch (error) {
            console.error('Import validation error:', error);
            if (typeof configManager !== 'undefined' && configManager.ui) {
                configManager.ui.showNotification(this.t('config.importError'), 'error');
            }
        } finally {
            // Clear the file input so it can detect the same file again
            const importFile = document.getElementById('import-file');
            if (importFile) {
                importFile.value = '';
            }
        }
    }

    /**
     * Perform the import operation
     * @param {JSZip} zip
     */
    async performImport(zip) {
        try {
            const formData = new FormData();

            // Extract and add files to FormData
            const files = zip.files;
            for (const [filename, zipEntry] of Object.entries(files)) {
                if (!zipEntry.dir) {
                    const content = await zipEntry.async('blob');
                    formData.append('files', content, filename);
                }
            }

            // Send to backend
            const response = await fetch('/api/import', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Import failed: ${response.statusText}`);
            }

            // Show success message
            if (typeof configManager !== 'undefined' && configManager.ui) {
                configManager.ui.showNotification(this.t('config.importSuccess'), 'success');
            }

            // Reload page after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Import error:', error);
            if (typeof configManager !== 'undefined' && configManager.ui) {
                configManager.ui.showNotification(this.t('config.importError'), 'error');
            }
        }
    }
}