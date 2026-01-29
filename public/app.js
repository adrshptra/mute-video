/**
 * ============================================================================
 * AUTO MUTE VIDEO SERVICE - Enterprise Edition
 * Client-Side JavaScript
 * ============================================================================
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
    currentFile: null,
    currentJobId: null,
    isUploading: false,
    isProcessing: false,
    uploadProgress: 0,
    processingProgress: 0,
    pollInterval: null,
    statsInterval: null
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    // Upload Zone
    uploadZone: document.getElementById('uploadZone'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    removeFile: document.getElementById('removeFile'),

    // Progress
    progressSection: document.getElementById('progressSection'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercentage: document.getElementById('progressPercentage'),
    progressBar: document.getElementById('progressBar'),

    // Stages
    stageUpload: document.getElementById('stageUpload'),
    stageProcess: document.getElementById('stageProcess'),
    stageComplete: document.getElementById('stageComplete'),

    // Buttons
    uploadBtn: document.getElementById('uploadBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    newUploadBtn: document.getElementById('newUploadBtn'),

    // Stats
    totalUploads: document.getElementById('totalUploads'),
    totalProcessed: document.getElementById('totalProcessed'),
    serverUptime: document.getElementById('serverUptime'),
    activeJobs: document.getElementById('activeJobs'),

    // Alert Container
    alertContainer: document.getElementById('alertContainer')
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format file size to human readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format uptime to human readable string
 * @param {object} uptime - Uptime object with days, hours, minutes, seconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(uptime) {
    const parts = [];

    if (uptime.days > 0) {
        parts.push(`${uptime.days}d`);
    }
    parts.push(`${uptime.hours}h`);
    parts.push(`${uptime.minutes}m`);
    parts.push(`${uptime.seconds}s`);

    return parts.join(' ');
}

/**
 * Validate if file is a supported video format
 * @param {File} file - File to validate
 * @returns {boolean} True if valid
 */
function isValidVideoFile(file) {
    const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpeg', '.mpg', '.3gp'];
    const extension = '.' + file.name.split('.').pop().toLowerCase();

    return allowedExtensions.includes(extension) || file.type.startsWith('video/');
}

/**
 * Check if file size is within limit (2GB)
 * @param {File} file - File to check
 * @returns {boolean} True if within limit
 */
function isFileSizeValid(file) {
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    return file.size <= maxSize;
}

// ============================================================================
// ALERT SYSTEM
// ============================================================================

/**
 * Show an alert notification
 * @param {string} type - Alert type: success, error, warning, info
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {number} duration - Auto-dismiss duration in ms (0 for no auto-dismiss)
 */
function showAlert(type, title, message, duration = 5000) {
    const alertId = 'alert-' + Date.now();

    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <line x1="12" y1="16" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="8" x2="12.01" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`
    };

    const alertHTML = `
        <div class="alert ${type}" id="${alertId}">
            <div class="alert-icon">${icons[type] || icons.info}</div>
            <div class="alert-content">
                <div class="alert-title">${title}</div>
                <div class="alert-message">${message}</div>
            </div>
            <button class="alert-close" onclick="dismissAlert('${alertId}')">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    `;

    elements.alertContainer.insertAdjacentHTML('beforeend', alertHTML);

    if (duration > 0) {
        setTimeout(() => {
            dismissAlert(alertId);
        }, duration);
    }
}

/**
 * Dismiss an alert
 * @param {string} alertId - Alert element ID
 */
function dismissAlert(alertId) {
    const alert = document.getElementById(alertId);
    if (alert) {
        alert.classList.add('removing');
        setTimeout(() => {
            alert.remove();
        }, 300);
    }
}

// Make dismissAlert available globally
window.dismissAlert = dismissAlert;

// ============================================================================
// FILE HANDLING
// ============================================================================

/**
 * Handle file selection
 * @param {File} file - Selected file
 */
function handleFileSelect(file) {
    // Reset state
    resetState();

    // Validate file type
    if (!isValidVideoFile(file)) {
        showAlert('error', 'Invalid File Type', 'Please select a valid video file (MP4, MOV, AVI, MKV, WebM, WMV, FLV)');
        return;
    }

    // Validate file size
    if (!isFileSizeValid(file)) {
        showAlert('error', 'File Too Large', 'Maximum file size is 2GB. Please select a smaller file.');
        return;
    }

    // Store file and update UI
    state.currentFile = file;

    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.fileInfo.style.display = 'flex';
    elements.uploadZone.style.display = 'none';
    elements.uploadBtn.disabled = false;

    showAlert('info', 'File Selected', `Ready to process: ${file.name}`);
}

/**
 * Remove selected file
 */
function removeFile() {
    state.currentFile = null;
    elements.fileInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.uploadZone.style.display = 'block';
    elements.uploadBtn.disabled = true;
}

// ============================================================================
// UPLOAD HANDLING
// ============================================================================

/**
 * Start the upload and processing
 */
async function startUpload() {
    if (!state.currentFile || state.isUploading) return;

    state.isUploading = true;
    elements.uploadBtn.disabled = true;
    elements.uploadBtn.classList.add('processing');

    // Show progress section
    elements.progressSection.style.display = 'block';
    updateProgress('Uploading...', 0);
    setStage('upload');

    const formData = new FormData();
    formData.append('video', state.currentFile);

    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            state.uploadProgress = percent;
            updateProgress('Uploading...', percent);
        }
    });

    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    state.currentJobId = response.jobId;
                    state.isUploading = false;
                    state.isProcessing = true;

                    showAlert('success', 'Upload Complete', 'Video uploaded successfully. Processing started...');

                    // Start polling for processing progress
                    setStage('process');
                    startProgressPolling();
                } else {
                    handleUploadError(response.error || 'Upload failed');
                }
            } catch (error) {
                handleUploadError('Invalid server response');
            }
        } else {
            try {
                const response = JSON.parse(xhr.responseText);
                handleUploadError(response.error || 'Upload failed');
            } catch (error) {
                handleUploadError('Upload failed with status: ' + xhr.status);
            }
        }
    });

    xhr.addEventListener('error', () => {
        handleUploadError('Network error occurred. Please check your connection.');
    });

    xhr.addEventListener('abort', () => {
        handleUploadError('Upload was cancelled.');
    });

    xhr.open('POST', '/upload');
    xhr.send(formData);
}

/**
 * Handle upload error
 * @param {string} message - Error message
 */
function handleUploadError(message) {
    state.isUploading = false;
    state.isProcessing = false;
    elements.uploadBtn.disabled = false;
    elements.uploadBtn.classList.remove('processing');

    showAlert('error', 'Upload Failed', message);
    updateProgress('Failed', 0);

    // Reset after a delay
    setTimeout(() => {
        elements.progressSection.style.display = 'none';
        resetStages();
    }, 3000);
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Update progress display
 * @param {string} status - Status text
 * @param {number} percent - Progress percentage
 */
function updateProgress(status, percent) {
    elements.progressStatus.textContent = status;
    elements.progressPercentage.textContent = percent + '%';
    elements.progressBar.querySelector('.progress-fill').style.width = percent + '%';
}

/**
 * Set the current stage
 * @param {string} stage - Stage name: upload, process, complete
 */
function setStage(stage) {
    const stages = ['upload', 'process', 'complete'];
    const stageElements = [elements.stageUpload, elements.stageProcess, elements.stageComplete];
    const lines = document.querySelectorAll('.stage-line');

    const currentIndex = stages.indexOf(stage);

    stageElements.forEach((el, index) => {
        el.classList.remove('active', 'completed');

        if (index < currentIndex) {
            el.classList.add('completed');
        } else if (index === currentIndex) {
            el.classList.add('active');
        }
    });

    lines.forEach((line, index) => {
        line.classList.remove('completed');
        if (index < currentIndex) {
            line.classList.add('completed');
        }
    });
}

/**
 * Reset all stages
 */
function resetStages() {
    elements.stageUpload.classList.remove('active', 'completed');
    elements.stageProcess.classList.remove('active', 'completed');
    elements.stageComplete.classList.remove('active', 'completed');

    document.querySelectorAll('.stage-line').forEach(line => {
        line.classList.remove('completed');
    });
}

/**
 * Start polling for processing progress
 */
function startProgressPolling() {
    updateProgress('Processing...', 0);

    state.pollInterval = setInterval(async () => {
        if (!state.currentJobId) {
            stopProgressPolling();
            return;
        }

        try {
            const response = await fetch(`/progress/${state.currentJobId}`);
            const data = await response.json();

            if (data.success) {
                state.processingProgress = data.progress;

                switch (data.status) {
                    case 'processing':
                        updateProgress('Processing...', data.progress);
                        break;

                    case 'completed':
                        stopProgressPolling();
                        handleProcessingComplete();
                        break;

                    case 'failed':
                        stopProgressPolling();
                        handleProcessingError(data.error || 'Processing failed');
                        break;
                }
            }
        } catch (error) {
            console.error('Error polling progress:', error);
        }
    }, 500);
}

/**
 * Stop polling for processing progress
 */
function stopProgressPolling() {
    if (state.pollInterval) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
    }
}

/**
 * Handle successful processing completion
 */
function handleProcessingComplete() {
    state.isProcessing = false;
    elements.uploadBtn.classList.remove('processing');

    updateProgress('Completed!', 100);
    setStage('complete');

    // Show download button
    elements.uploadBtn.style.display = 'none';
    elements.downloadBtn.style.display = 'inline-flex';
    elements.newUploadBtn.style.display = 'inline-flex';

    showAlert('success', 'Processing Complete', 'Your video has been muted successfully. Click download to get your file.');
}

/**
 * Handle processing error
 * @param {string} message - Error message
 */
function handleProcessingError(message) {
    state.isProcessing = false;
    elements.uploadBtn.classList.remove('processing');
    elements.uploadBtn.disabled = false;

    showAlert('error', 'Processing Failed', message);
    updateProgress('Failed', 0);

    // Show retry option
    elements.newUploadBtn.style.display = 'inline-flex';
}

// ============================================================================
// DOWNLOAD HANDLING
// ============================================================================

/**
 * Download the processed video
 */
function downloadVideo() {
    if (!state.currentJobId) return;

    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = `/download/${state.currentJobId}`;
    link.download = 'muted_video.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showAlert('info', 'Download Started', 'Your muted video is being downloaded.');
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Fetch and update server statistics
 */
async function updateStats() {
    try {
        const response = await fetch('/stats');
        const data = await response.json();

        if (data.success) {
            elements.totalUploads.textContent = data.totalUploads;
            elements.totalProcessed.textContent = data.totalProcessed;
            elements.activeJobs.textContent = data.activeJobs;
            elements.serverUptime.textContent = formatUptime(data.uptime);
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

/**
 * Start statistics polling
 */
function startStatsPolling() {
    updateStats();
    state.statsInterval = setInterval(updateStats, 1000);
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Reset application state
 */
function resetState() {
    stopProgressPolling();

    state.currentFile = null;
    state.currentJobId = null;
    state.isUploading = false;
    state.isProcessing = false;
    state.uploadProgress = 0;
    state.processingProgress = 0;
}

/**
 * Reset UI for new upload
 */
function resetForNewUpload() {
    resetState();

    // Reset file input
    elements.fileInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.uploadZone.style.display = 'block';

    // Reset progress
    elements.progressSection.style.display = 'none';
    updateProgress('Uploading...', 0);
    resetStages();

    // Reset buttons
    elements.uploadBtn.style.display = 'inline-flex';
    elements.uploadBtn.disabled = true;
    elements.uploadBtn.classList.remove('processing');
    elements.downloadBtn.style.display = 'none';
    elements.newUploadBtn.style.display = 'none';
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Upload Zone - Click
elements.uploadZone.addEventListener('click', () => {
    elements.fileInput.click();
});

// File Input - Change
elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
    }
});

// Drag and Drop
elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadZone.classList.add('dragover');
});

elements.uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadZone.classList.remove('dragover');
});

elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadZone.classList.remove('dragover');

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// Remove File Button
elements.removeFile.addEventListener('click', removeFile);

// Upload Button
elements.uploadBtn.addEventListener('click', startUpload);

// Download Button
elements.downloadBtn.addEventListener('click', downloadVideo);

// New Upload Button
elements.newUploadBtn.addEventListener('click', resetForNewUpload);

// Prevent default drag behaviors on document
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
function init() {
    // Start statistics polling
    startStatsPolling();

    // Show welcome message
    showAlert('info', 'Welcome', 'Auto Mute Video Service is ready. Drop a video file to get started.', 3000);

    console.log('Auto Mute Video Service - Enterprise Edition initialized');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
