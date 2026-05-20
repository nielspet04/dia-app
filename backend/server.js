const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PHOTO_UPLOADS_PER_SESSION = 5;
const MAX_VIDEO_UPLOADS_PER_SESSION = 1;
const MAX_GUEST_NAME_LENGTH = 80;
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 250);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'guyenria123';
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : ['http://localhost:5173'];

// server.js
app.set('trust proxy', true);
const corsOptions = {
  origin: allowedOrigins,
  credentials: true
};
app.use(cors(corsOptions));
// Serve built frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});
// Middleware
app.use(express.json());
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Opslag voor uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup voor file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 }
});

const placeholders = (items) => items.map(() => '?').join(',');
const photoExtensionPlaceholders = placeholders(PHOTO_EXTENSIONS);
const videoExtensionPlaceholders = placeholders(VIDEO_EXTENSIONS);

const getFileExtension = (filename) => path.extname(filename).slice(1).toLowerCase();
const isPhotoFile = (file) => file.mimetype.startsWith('image/') && PHOTO_EXTENSIONS.includes(getFileExtension(file.originalname));
const isVideoFile = (file) => file.mimetype.startsWith('video/') && VIDEO_EXTENSIONS.includes(getFileExtension(file.originalname));
const countUploadsByType = (sessionId, type, callback) => {
  const extensions = type === 'video' ? VIDEO_EXTENSIONS : PHOTO_EXTENSIONS;
  const extensionPlaceholders = type === 'video' ? videoExtensionPlaceholders : photoExtensionPlaceholders;

  db.get(
    `SELECT COUNT(*) AS count FROM uploads WHERE session_id = ? AND LOWER(filetype) IN (${extensionPlaceholders})`,
    [sessionId, ...extensions],
    callback
  );
};

const removeUploadedFiles = (files = []) => {
  files.forEach((file) => {
    fs.unlink(file.path, (err) => {
      if (err) console.error('Failed to remove rejected upload:', err);
    });
  });
};

const removeUploadFile = (filepath) => {
  const filename = path.basename(filepath);
  const fullPath = path.join(uploadDir, filename);

  return fs.promises.unlink(fullPath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
};

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'trouw.db'));

db.serialize(() => {
  // Uploads table
  db.run(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filetype TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT,
      guest_name TEXT
    )
  `);

  db.all('PRAGMA table_info(uploads)', (err, columns) => {
    if (err) return console.error('Failed to inspect uploads table:', err);

    const hasGuestName = columns.some(column => column.name === 'guest_name');
    if (!hasGuestName) {
      db.run('ALTER TABLE uploads ADD COLUMN guest_name TEXT', (alterErr) => {
        if (alterErr) console.error('Failed to add guest_name column:', alterErr);
      });
    }
  });

  // Spotify requests table
  db.run(`
    CREATE TABLE IF NOT EXISTS spotify_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      added_to_playlist INTEGER DEFAULT 0
    )
  `);

  // Settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// API Routes

app.get('/api/uploads/count', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  const uploadType = req.query.type === 'video' ? 'video' : 'photo';
  const limit = uploadType === 'video' ? MAX_VIDEO_UPLOADS_PER_SESSION : MAX_PHOTO_UPLOADS_PER_SESSION;

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt' });
  }

  countUploadsByType(sessionId, uploadType, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    const count = row?.count || 0;
    res.json({
      count,
      remaining: Math.max(0, limit - count),
      limit
    });
  });
});

// Upload media
app.post('/api/upload', upload.array('files', 6), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Geen bestanden geupload' });
    }

    const sessionId = String(req.body.sessionId || '').trim();
    const guestName = String(req.body.guestName || '').trim().replace(/\s+/g, ' ');

    if (!sessionId) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: 'Sessie ontbreekt, herlaad de pagina en probeer opnieuw' });
    }

    if (!guestName) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: 'Vul eerst je naam in' });
    }

    if (guestName.length > MAX_GUEST_NAME_LENGTH) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: `Naam mag maximaal ${MAX_GUEST_NAME_LENGTH} tekens zijn` });
    }

    if (req.files.length > MAX_PHOTO_UPLOADS_PER_SESSION) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: `Maximum ${MAX_PHOTO_UPLOADS_PER_SESSION} foto's toegestaan` });
    }

    const invalidFiles = req.files.filter(file => !isPhotoFile(file));
    if (invalidFiles.length > 0) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: 'Alleen foto\'s (JPG, PNG, GIF) toegestaan' });
    }

    countUploadsByType(sessionId, 'photo', (err, row) => {
      if (err) {
        removeUploadedFiles(req.files);
        return res.status(500).json({ error: err.message });
      }

      const currentCount = row?.count || 0;
      const remaining = MAX_PHOTO_UPLOADS_PER_SESSION - currentCount;

      if (remaining <= 0 || req.files.length > remaining) {
        removeUploadedFiles(req.files);
        return res.status(400).json({
          error: remaining <= 0
            ? `Je hebt al ${MAX_PHOTO_UPLOADS_PER_SESSION} foto's geupload`
            : `Je kunt nog maar ${remaining} foto${remaining === 1 ? '' : "'s"} uploaden`
        });
      }

      const uploaded = req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        path: `/uploads/${file.filename}`
      }));

      const insert = db.prepare(
        'INSERT INTO uploads (filename, filepath, filetype, session_id, guest_name) VALUES (?, ?, ?, ?, ?)'
      );

      uploaded.forEach(file => {
        insert.run(file.filename, file.path, file.originalname.split('.').pop(), sessionId, guestName);
      });

      insert.finalize((finalizeErr) => {
        if (finalizeErr) return res.status(500).json({ error: finalizeErr.message });

        res.json({
          success: true,
          files: uploaded,
          remaining: remaining - uploaded.length,
          message: `${uploaded.length} bestanden succesvol geupload`
        });
      });
    });
  } catch (error) {
    removeUploadedFiles(req.files);
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload mislukt' });
  }
});

app.post('/api/video-upload', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen video geupload' });
    }

    const sessionId = String(req.body.sessionId || '').trim();
    const guestName = String(req.body.guestName || '').trim().replace(/\s+/g, ' ');

    if (!sessionId) {
      removeUploadedFiles([req.file]);
      return res.status(400).json({ error: 'Sessie ontbreekt, herlaad de pagina en probeer opnieuw' });
    }

    if (!guestName) {
      removeUploadedFiles([req.file]);
      return res.status(400).json({ error: 'Vul eerst je naam in' });
    }

    if (guestName.length > MAX_GUEST_NAME_LENGTH) {
      removeUploadedFiles([req.file]);
      return res.status(400).json({ error: `Naam mag maximaal ${MAX_GUEST_NAME_LENGTH} tekens zijn` });
    }

    if (!isVideoFile(req.file)) {
      removeUploadedFiles([req.file]);
      return res.status(400).json({ error: 'Alleen video\'s (MP4, MOV, WebM) toegestaan' });
    }

    countUploadsByType(sessionId, 'video', (err, row) => {
      if (err) {
        removeUploadedFiles([req.file]);
        return res.status(500).json({ error: err.message });
      }

      const currentCount = row?.count || 0;
      const remaining = MAX_VIDEO_UPLOADS_PER_SESSION - currentCount;

      if (remaining <= 0) {
        removeUploadedFiles([req.file]);
        return res.status(400).json({ error: 'Je hebt al 1 video geupload' });
      }

      const uploaded = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: `/uploads/${req.file.filename}`
      };

      db.run(
        'INSERT INTO uploads (filename, filepath, filetype, session_id, guest_name) VALUES (?, ?, ?, ?, ?)',
        [uploaded.filename, uploaded.path, getFileExtension(req.file.originalname), sessionId, guestName],
        (insertErr) => {
          if (insertErr) {
            removeUploadedFiles([req.file]);
            return res.status(500).json({ error: insertErr.message });
          }

          res.json({
            success: true,
            file: uploaded,
            remaining: remaining - 1,
            message: 'Video succesvol geupload'
          });
        }
      );
    });
  } catch (error) {
    removeUploadedFiles(req.file ? [req.file] : []);
    console.error('Video upload error:', error);
    res.status(500).json({ error: 'Video upload mislukt' });
  }
});

// Spotify: Get all requests
app.get('/api/spotify/requests', (req, res) => {
  db.all('SELECT * FROM spotify_requests ORDER BY requested_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Spotify: Search tracks
app.get('/api/spotify/search', (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });

  // Placeholder - we'll implement real Spotify search later
  res.json({
    message: 'Spotify search - to be implemented',
    query
  });
});

// Spotify: Add request
app.post('/api/spotify/request', express.json(), (req, res) => {
  const { trackId, trackName, artistName } = req.body;
  
  if (!trackId || !trackName || !artistName) {
    return res.status(400).json({ error: 'Vereiste velden ontbreken' });
  }

  db.run(
    'INSERT INTO spotify_requests (track_id, track_name, artist_name) VALUES (?, ?, ?)',
    [trackId, trackName, artistName],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Nummer toegevoegd aan aanvragen' });
    }
  );
});

// Get all uploads
app.get('/api/uploads', (req, res) => {
  db.all('SELECT * FROM uploads ORDER BY uploaded_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.delete('/api/uploads/:id', (req, res) => {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Niet bevoegd' });
  }

  const uploadId = Number(req.params.id);

  if (!Number.isInteger(uploadId)) {
    return res.status(400).json({ error: 'Ongeldig upload id' });
  }

  db.get('SELECT * FROM uploads WHERE id = ?', [uploadId], async (err, uploadRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!uploadRow) return res.status(404).json({ error: 'Upload niet gevonden' });

    try {
      await removeUploadFile(uploadRow.filepath);
    } catch (fileErr) {
      console.error('Failed to delete upload file:', fileErr);
      return res.status(500).json({ error: 'Bestand verwijderen mislukt' });
    }

    db.run('DELETE FROM uploads WHERE id = ?', [uploadId], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      res.json({ success: true, message: 'Foto verwijderd' });
    });
  });
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// Start server with HTTPS in production
if (process.env.NODE_ENV === 'production') {
  const certPath = process.env.CERT_PATH || path.join(__dirname, 'server.crt');
  const keyPath = process.env.KEY_PATH || path.join(__dirname, 'server.key');
  
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const credentials = {
      cert: fs.readFileSync(certPath, 'utf8'),
      key: fs.readFileSync(keyPath, 'utf8')
    };
    https.createServer(credentials, app).listen(PORT, HOST, () => {
      console.log(`🎉 Backend server running on https://5.22.208.187:${PORT}`);
      console.log(`Database: sqlite3 @ ./trouw.db`);
    });
  } else {
    // Fallback to HTTP if certs don't exist
    app.listen(PORT, HOST, () => {
      console.log(`🎉 Backend server running on http://5.22.208.187:${PORT}`);
      console.log(`ℹ️ For camera access, set up HTTPS with SSL certificates`);
      console.log(`Database: sqlite3 @ ./trouw.db`);
    });
  }
} else {
  app.listen(PORT, HOST, () => {
    console.log(`🎉 Backend server running on http://${HOST}:${PORT}`);
    console.log(`Database: sqlite3 @ ./trouw.db`);
  });
}
