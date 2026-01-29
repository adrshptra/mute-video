/**
 * ============================================================================
 * AUTO MUTE VIDEO SERVICE - Enterprise Edition
 * ============================================================================
 * 
 * A professional-grade video processing service that removes audio from
 * video files using FFmpeg. Features real-time progress tracking, automatic
 * cleanup, and LAN accessibility.
 * 
 * @author Enterprise Development Team
 * @version 1.0.0
 * @license MIT
 * ============================================================================
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    PORT: 3000,
    HOST: '0.0.0.0',
    MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
    FILE_RETENTION_MS: 60 * 60 * 1000, // 1 hour
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
    ALLOWED_EXTENSIONS: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpeg', '.mpg', '.3gp'],
    ALLOWED_MIMETYPES: [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/webm',
        'video/x-ms-wmv',
        'video/x-flv',
        'video/mpeg',
        'video/3gpp',
        'application/octet-stream'
    ]
};

// ============================================================================
// DIRECTORY SETUP
// ============================================================================

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Create directories if they don't exist
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

// ============================================================================
// LOGGING SYSTEM
// ============================================================================

const LOG_LEVELS = {
    INFO: { label: 'INFO', color: '\x1b[36m' },
    SUCCESS: { label: 'SUCCESS', color: '\x1b[32m' },
    WARNING: { label: 'WARNING', color: '\x1b[33m' },
    ERROR: { label: 'ERROR', color: '\x1b[31m' }
};

function log(level, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    const reset = '\x1b[0m';
    console.log(`${logLevel.color}[${timestamp}] [${logLevel.label}]${reset} ${message}`);
}

// ============================================================================
// FFMPEG CHECKER
// ============================================================================

function checkFFmpeg() {
    try {
        execSync('ffmpeg -version', { stdio: 'pipe' });
        log('SUCCESS', 'FFmpeg is available and ready');
        return true;
    } catch (error) {
        log('ERROR', '═══════════════════════════════════════════════════════════════');
        log('ERROR', 'FFmpeg is NOT installed or not found in system PATH!');
        log('ERROR', '');
        log('ERROR', 'Please install FFmpeg:');
        log('ERROR', '  Windows: Download from https://ffmpeg.org/download.html');
        log('ERROR', '           Or use: winget install FFmpeg');
        log('ERROR', '           Or use: choco install ffmpeg');
        log('ERROR', '');
        log('ERROR', '  Make sure ffmpeg.exe is in your system PATH');
        log('ERROR', '═══════════════════════════════════════════════════════════════');
        return false;
    }
}

// ============================================================================
// SERVER STATE
// ============================================================================

const serverStartTime = Date.now();
const jobs = new Map();
const stats = {
    totalUploads: 0,
    totalProcessed: 0,
    totalFailed: 0
};

// Job status enum
const JOB_STATUS = {
    UPLOADING: 'uploading',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============================================================================
// MULTER CONFIGURATION
// ============================================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const jobId = uuidv4();
        const ext = path.extname(file.originalname).toLowerCase();
        const safeFilename = `${jobId}${ext}`;
        req.jobId = jobId;
        cb(null, safeFilename);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Check extension
    if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
        log('WARNING', `Rejected file with invalid extension: ${ext}`);
        return cb(new Error(`Invalid file type. Allowed: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`), false);
    }
    
    // Check MIME type (allow octet-stream for large files)
    if (!CONFIG.ALLOWED_MIMETYPES.includes(file.mimetype)) {
        log('WARNING', `Rejected file with invalid MIME type: ${file.mimetype}`);
        return cb(new Error('Invalid file type. Please upload a valid video file.'), false);
    }
    
    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: CONFIG.MAX_FILE_SIZE
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getUptime() {
    const uptimeMs = Date.now() - serverStartTime;
    const seconds = Math.floor(uptimeMs / 1000) % 60;
    const minutes = Math.floor(uptimeMs / (1000 * 60)) % 60;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60)) % 24;
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    
    return { days, hours, minutes, seconds, totalMs: uptimeMs };
}

function sanitizePath(inputPath) {
    // Prevent path traversal attacks
    const normalized = path.normalize(inputPath);
    if (normalized.includes('..')) {
        return null;
    }
    return normalized;
}

function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        
        let output = '';
        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        ffprobe.on('close', (code) => {
            if (code === 0) {
                const duration = parseFloat(output.trim());
                resolve(duration || 0);
            } else {
                resolve(0);
            }
        });
        
        ffprobe.on('error', () => {
            resolve(0);
        });
    });
}

// ============================================================================
// VIDEO PROCESSING
// ============================================================================

async function processVideo(jobId, inputPath, originalName) {
    const job = jobs.get(jobId);
    if (!job) return;
    
    const ext = path.extname(originalName).toLowerCase();
    const outputFilename = `${jobId}_muted${ext}`;
    const outputPath = path.join(OUTPUTS_DIR, outputFilename);
    
    job.status = JOB_STATUS.PROCESSING;
    job.progress = 0;
    job.outputPath = outputPath;
    job.outputFilename = `muted_${originalName}`;
    
    log('INFO', `Processing started for job ${jobId}`);
    
    // Get video duration for progress calculation
    const duration = await getVideoDuration(inputPath);
    log('INFO', `Video duration: ${duration.toFixed(2)} seconds`);
    
    return new Promise((resolve, reject) => {
        const ffmpegArgs = [
            '-i', inputPath,
            '-an',                    // Remove audio
            '-c:v', 'copy',          // Copy video codec (fast, no re-encoding)
            '-y',                     // Overwrite output
            '-progress', 'pipe:1',   // Output progress to stdout
            '-nostats',              // Disable stats
            outputPath
        ];
        
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let stderrData = '';
        
        ffmpeg.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('out_time_ms=')) {
                    const timeMs = parseInt(line.split('=')[1]) / 1000000;
                    if (duration > 0) {
                        const progress = Math.min(99, Math.round((timeMs / duration) * 100));
                        job.progress = progress;
                    }
                }
            }
        });
        
        ffmpeg.stderr.on('data', (data) => {
            stderrData += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                job.status = JOB_STATUS.COMPLETED;
                job.progress = 100;
                job.completedAt = Date.now();
                stats.totalProcessed++;
                log('SUCCESS', `Job ${jobId} completed successfully`);
                resolve();
            } else {
                job.status = JOB_STATUS.FAILED;
                job.error = 'FFmpeg processing failed';
                stats.totalFailed++;
                log('ERROR', `Job ${jobId} failed: ${stderrData.substring(0, 200)}`);
                reject(new Error('FFmpeg processing failed'));
            }
        });
        
        ffmpeg.on('error', (error) => {
            job.status = JOB_STATUS.FAILED;
            job.error = error.message;
            stats.totalFailed++;
            log('ERROR', `Job ${jobId} error: ${error.message}`);
            reject(error);
        });
    });
}

// ============================================================================
// API ROUTES
// ============================================================================

// Upload endpoint
app.post('/upload', (req, res) => {
    upload.single('video')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                log('WARNING', 'File upload rejected: exceeds 2GB limit');
                return res.status(413).json({
                    success: false,
                    error: 'File too large. Maximum size is 2GB.'
                });
            }
            log('ERROR', `Upload error: ${err.message}`);
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        
        if (!req.file) {
            log('WARNING', 'Upload attempt with no file');
            return res.status(400).json({
                success: false,
                error: 'No video file uploaded'
            });
        }
        
        const jobId = req.jobId;
        const inputPath = req.file.path;
        const originalName = req.file.originalname;
        
        // Create job entry
        jobs.set(jobId, {
            id: jobId,
            status: JOB_STATUS.UPLOADING,
            progress: 0,
            originalName: originalName,
            inputPath: inputPath,
            outputPath: null,
            outputFilename: null,
            createdAt: Date.now(),
            completedAt: null,
            error: null
        });
        
        stats.totalUploads++;
        log('SUCCESS', `File uploaded: ${originalName} (Job ID: ${jobId})`);
        
        // Start processing in background
        processVideo(jobId, inputPath, originalName).catch((error) => {
            log('ERROR', `Background processing error: ${error.message}`);
        });
        
        res.json({
            success: true,
            jobId: jobId,
            message: 'Upload successful, processing started'
        });
    });
});

// Progress endpoint
app.get('/progress/:id', (req, res) => {
    const jobId = sanitizePath(req.params.id);
    if (!jobId) {
        return res.status(400).json({
            success: false,
            error: 'Invalid job ID'
        });
    }
    
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({
            success: false,
            error: 'Job not found'
        });
    }
    
    res.json({
        success: true,
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        originalName: job.originalName,
        error: job.error
    });
});

// Download endpoint
app.get('/download/:id', (req, res) => {
    const jobId = sanitizePath(req.params.id);
    if (!jobId) {
        return res.status(400).json({
            success: false,
            error: 'Invalid job ID'
        });
    }
    
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({
            success: false,
            error: 'Job not found'
        });
    }
    
    if (job.status !== JOB_STATUS.COMPLETED) {
        return res.status(400).json({
            success: false,
            error: 'Job not completed yet'
        });
    }
    
    if (!job.outputPath || !fs.existsSync(job.outputPath)) {
        return res.status(404).json({
            success: false,
            error: 'Output file not found'
        });
    }
    
    log('INFO', `Download requested for job ${jobId}`);
    res.download(job.outputPath, job.outputFilename);
});

// Statistics endpoint
app.get('/stats', (req, res) => {
    const uptime = getUptime();
    res.json({
        success: true,
        uptime: uptime,
        totalUploads: stats.totalUploads,
        totalProcessed: stats.totalProcessed,
        totalFailed: stats.totalFailed,
        activeJobs: Array.from(jobs.values()).filter(j => 
            j.status === JOB_STATUS.UPLOADING || j.status === JOB_STATUS.PROCESSING
        ).length
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// ============================================================================
// AUTO CLEANUP SERVICE
// ============================================================================

function cleanupOldFiles() {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Cleanup uploads directory
    if (fs.existsSync(UPLOADS_DIR)) {
        const uploadFiles = fs.readdirSync(UPLOADS_DIR);
        for (const file of uploadFiles) {
            const filePath = path.join(UPLOADS_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > CONFIG.FILE_RETENTION_MS) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            } catch (error) {
                log('WARNING', `Failed to cleanup upload file: ${file}`);
            }
        }
    }
    
    // Cleanup outputs directory
    if (fs.existsSync(OUTPUTS_DIR)) {
        const outputFiles = fs.readdirSync(OUTPUTS_DIR);
        for (const file of outputFiles) {
            const filePath = path.join(OUTPUTS_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > CONFIG.FILE_RETENTION_MS) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            } catch (error) {
                log('WARNING', `Failed to cleanup output file: ${file}`);
            }
        }
    }
    
    // Cleanup old jobs from memory
    for (const [jobId, job] of jobs.entries()) {
        if (now - job.createdAt > CONFIG.FILE_RETENTION_MS) {
            jobs.delete(jobId);
        }
    }
    
    if (cleanedCount > 0) {
        log('INFO', `Cleanup completed: ${cleanedCount} files removed`);
    }
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

app.use((err, req, res, next) => {
    log('ERROR', `Unhandled error: ${err.message}`);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

function startServer() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║       AUTO MUTE VIDEO SERVICE - Enterprise Edition            ║');
    console.log('║                      Version 1.0.0                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Check FFmpeg
    if (!checkFFmpeg()) {
        process.exit(1);
    }
    
    // Start cleanup interval
    setInterval(cleanupOldFiles, CONFIG.CLEANUP_INTERVAL_MS);
    log('INFO', `Auto cleanup scheduled every ${CONFIG.CLEANUP_INTERVAL_MS / 60000} minutes`);
    log('INFO', `File retention: ${CONFIG.FILE_RETENTION_MS / 3600000} hour(s)`);
    
    // Start server
    app.listen(CONFIG.PORT, CONFIG.HOST, () => {
        console.log('');
        log('SUCCESS', '═══════════════════════════════════════════════════════════════');
        log('SUCCESS', `Server running on http://${CONFIG.HOST}:${CONFIG.PORT}`);
        log('SUCCESS', '');
        log('SUCCESS', 'Access URLs:');
        log('SUCCESS', `  Local:   http://localhost:${CONFIG.PORT}`);
        log('SUCCESS', `  LAN:     http://<YOUR_IP>:${CONFIG.PORT}`);
        log('SUCCESS', '');
        log('SUCCESS', 'To find your LAN IP, run: ipconfig');
        log('SUCCESS', '═══════════════════════════════════════════════════════════════');
        console.log('');
    });
}

// Start the server
startServer();
