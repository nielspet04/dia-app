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

// server.js
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://5.22.208.187', 'http://5.22.208.187:5173', 'https://5.22.208.187'] 
    : 'http://localhost:5173',
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
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

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
      session_id TEXT
    )
  `);

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

// Upload media
app.post('/api/upload', upload.array('files', 6), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Geen bestanden geupload' });
    }

    const uploaded = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      path: `/uploads/${file.filename}`
    }));

    // Save to database
    uploaded.forEach(file => {
      db.run('INSERT INTO uploads (filename, filepath, filetype) VALUES (?, ?, ?)',
        [file.filename, file.path, file.originalname.split('.').pop()]
      );
    });

    res.json({
      success: true,
      files: uploaded,
      message: `${uploaded.length} bestanden succesvol geupload`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload mislukt' });
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
