const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PHOTO_UPLOADS_PER_SESSION = 5;
const MAX_VIDEO_UPLOADS_PER_SESSION = 1;
const MAX_AUDIO_UPLOADS_PER_SESSION = 1;
const MAX_GUEST_NAME_LENGTH = 80;
const MAX_TEXT_MESSAGE_LENGTH = 800;
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 250);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'DiaInstituut123';
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'];
const AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp3', 'wav', 'ogg'];
const SPOTIFY_SCOPE = 'playlist-modify-public playlist-modify-private user-read-currently-playing user-read-playback-state';
const SPOTIFY_MARKET = process.env.SPOTIFY_MARKET || 'BE';
const ZIP_UTF8_FLAG = 0x0800;
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
const audioExtensionPlaceholders = placeholders(AUDIO_EXTENSIONS);

const getFileExtension = (filename) => path.extname(filename).slice(1).toLowerCase();
const isPhotoFile = (file) => file.mimetype.startsWith('image/') && PHOTO_EXTENSIONS.includes(getFileExtension(file.originalname));
const isVideoFile = (file) => file.mimetype.startsWith('video/') && VIDEO_EXTENSIONS.includes(getFileExtension(file.originalname));
const isAudioFile = (file) => file.mimetype.startsWith('audio/') && AUDIO_EXTENSIONS.includes(getFileExtension(file.originalname));
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

const updateCrc32 = (crc, chunk) => {
  let nextCrc = crc;
  for (const byte of chunk) {
    nextCrc = crcTable[(nextCrc ^ byte) & 0xff] ^ (nextCrc >>> 8);
  }
  return nextCrc >>> 0;
};

const calculateFileCrc32 = (filePath) => new Promise((resolve, reject) => {
  let crc = 0xffffffff;
  const stream = fs.createReadStream(filePath);

  stream.on('data', (chunk) => {
    crc = updateCrc32(crc, chunk);
  });
  stream.on('end', () => resolve((crc ^ 0xffffffff) >>> 0));
  stream.on('error', reject);
});

const toDosDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.max(1980, safeDate.getFullYear());

  return {
    date: ((year - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate(),
    time: (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | Math.floor(safeDate.getSeconds() / 2)
  };
};

const sanitizeZipSegment = (value, fallback) => {
  const segment = String(value || fallback || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  return segment || fallback;
};

const createZipLocalHeader = (entry) => {
  const filenameBuffer = Buffer.from(entry.zipPath, 'utf8');
  const header = Buffer.alloc(30 + filenameBuffer.length);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(filenameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  filenameBuffer.copy(header, 30);

  return header;
};

const createZipCentralHeader = (entry) => {
  const filenameBuffer = Buffer.from(entry.zipPath, 'utf8');
  const header = Buffer.alloc(46 + filenameBuffer.length);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(filenameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  filenameBuffer.copy(header, 46);

  return header;
};

const createZipEndRecord = (entryCount, centralSize, centralOffset) => {
  const record = Buffer.alloc(22);

  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);

  return record;
};

const streamFileToResponse = (filePath, res) => new Promise((resolve, reject) => {
  const stream = fs.createReadStream(filePath);

  stream.on('data', (chunk) => {
    if (!res.write(chunk)) {
      stream.pause();
      res.once('drain', () => stream.resume());
    }
  });
  stream.on('end', resolve);
  stream.on('error', reject);
});

const countUploadsByType = (sessionId, type, callback) => {
  const typeConfig = {
    audio: { extensions: AUDIO_EXTENSIONS, placeholders: audioExtensionPlaceholders },
    photo: { extensions: PHOTO_EXTENSIONS, placeholders: photoExtensionPlaceholders },
    video: { extensions: VIDEO_EXTENSIONS, placeholders: videoExtensionPlaceholders }
  };
  const { extensions, placeholders: extensionPlaceholders } = typeConfig[type] || typeConfig.photo;

  db.get(
    `SELECT COUNT(*) AS count
     FROM uploads
     WHERE session_id = ?
       AND COALESCE(guest_removed, 0) = 0
       AND (media_type = ? OR (media_type IS NULL AND LOWER(filetype) IN (${extensionPlaceholders})))`,
    [sessionId, type, ...extensions],
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

const getSetting = (key) => new Promise((resolve, reject) => {
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) return reject(err);
    resolve(row?.value || null);
  });
});

const setSetting = (key, value) => new Promise((resolve, reject) => {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
    (err) => {
      if (err) return reject(err);
      resolve();
    }
  );
});

const getSpotifyRedirectUri = (req) => (
  process.env.SPOTIFY_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/spotify/callback`
);

const normalizeSpotifyPlaylistId = (value = '') => {
  const playlistValue = String(value).trim();
  const match = playlistValue.match(/playlist\/([A-Za-z0-9]+)/);
  return match ? match[1] : playlistValue;
};

const getSpotifyConfig = () => ({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  playlistId: normalizeSpotifyPlaylistId(process.env.SPOTIFY_PLAYLIST_ID)
});

const requireSpotifyConfig = () => {
  const config = getSpotifyConfig();
  if (!config.clientId || !config.clientSecret || !config.playlistId) {
    throw new Error('Spotify is nog niet geconfigureerd');
  }
  return config;
};

const requestSpotifyToken = async (body, config = getSpotifyConfig()) => {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Spotify client gegevens ontbreken');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Spotify token ophalen mislukt');
  }

  return payload;
};

const getSpotifyAccessToken = async () => {
  const config = requireSpotifyConfig();
  const refreshToken = await getSetting('spotify_refresh_token') || process.env.SPOTIFY_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error('Spotify is nog niet gekoppeld');
  }

  const token = await requestSpotifyToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }), config);

  return token.access_token;
};

const spotifyApiFetch = async (url, options = {}) => {
  const accessToken = await getSpotifyAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    const message = payload.error?.message || payload.error_description || payload.error || responseText || 'Spotify request mislukt';
    throw new Error(`Spotify ${response.status}: ${message}`);
  }

  return payload;
};

const mapSpotifyTrack = (item) => {
  if (!item || item.type !== 'track') return null;

  return {
    id: item.id,
    name: item.name,
    artist: item.artists?.map(artist => artist.name).join(', ') || '',
    album: item.album?.name || '',
    durationMs: item.duration_ms || 0,
    image: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || item.album?.images?.[2]?.url || '',
    externalUrl: item.external_urls?.spotify || ''
  };
};

const addSpotifyPlaylistTrack = async (trackUri) => {
  const config = requireSpotifyConfig();
  return spotifyApiFetch(
    `https://api.spotify.com/v1/playlists/${config.playlistId}/items`,
    {
      method: 'POST',
      body: JSON.stringify({ uris: [trackUri] })
    }
  );
};

const removeSpotifyPlaylistTrack = async (trackUri) => {
  const config = requireSpotifyConfig();
  return spotifyApiFetch(
    `https://api.spotify.com/v1/playlists/${config.playlistId}/items`,
    {
      method: 'DELETE',
      body: JSON.stringify({ items: [{ uri: trackUri }] })
    }
  );
};

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
      guest_name TEXT,
      media_type TEXT,
      guest_removed INTEGER DEFAULT 0
    )
  `);

  db.all('PRAGMA table_info(uploads)', (err, columns) => {
    if (err) return console.error('Failed to inspect uploads table:', err);

    const hasGuestName = columns.some(column => column.name === 'guest_name');
    const hasMediaType = columns.some(column => column.name === 'media_type');
    const hasGuestRemoved = columns.some(column => column.name === 'guest_removed');
    if (!hasGuestName) {
      db.run('ALTER TABLE uploads ADD COLUMN guest_name TEXT', (alterErr) => {
        if (alterErr) console.error('Failed to add guest_name column:', alterErr);
      });
    }
    if (!hasMediaType) {
      db.run('ALTER TABLE uploads ADD COLUMN media_type TEXT', (alterErr) => {
        if (alterErr) console.error('Failed to add media_type column:', alterErr);
      });
    }
    if (!hasGuestRemoved) {
      db.run('ALTER TABLE uploads ADD COLUMN guest_removed INTEGER DEFAULT 0', (alterErr) => {
        if (alterErr) console.error('Failed to add guest_removed column:', alterErr);
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
      track_uri TEXT,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      added_to_playlist INTEGER DEFAULT 0,
      session_id TEXT,
      guest_name TEXT,
      snapshot_id TEXT
    )
  `);

  db.all('PRAGMA table_info(spotify_requests)', (err, columns) => {
    if (err) return console.error('Failed to inspect spotify_requests table:', err);

    const columnNames = columns.map(column => column.name);
    const migrations = [
      ['track_uri', 'ALTER TABLE spotify_requests ADD COLUMN track_uri TEXT'],
      ['session_id', 'ALTER TABLE spotify_requests ADD COLUMN session_id TEXT'],
      ['guest_name', 'ALTER TABLE spotify_requests ADD COLUMN guest_name TEXT'],
      ['snapshot_id', 'ALTER TABLE spotify_requests ADD COLUMN snapshot_id TEXT']
    ];

    migrations.forEach(([columnName, sql]) => {
      if (!columnNames.includes(columnName)) {
        db.run(sql, (alterErr) => {
          if (alterErr) console.error(`Failed to add ${columnName} column:`, alterErr);
        });
      }
    });
  });

  // Text messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      guest_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  const uploadType = ['audio', 'photo', 'video'].includes(req.query.type) ? req.query.type : 'photo';
  const limitByType = {
    audio: MAX_AUDIO_UPLOADS_PER_SESSION,
    photo: MAX_PHOTO_UPLOADS_PER_SESSION,
    video: MAX_VIDEO_UPLOADS_PER_SESSION
  };
  const limit = limitByType[uploadType];

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

app.get('/api/uploads/mine', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt' });
  }

  db.all(
    `SELECT *
     FROM uploads
     WHERE session_id = ?
       AND COALESCE(guest_removed, 0) = 0
       AND (media_type = 'photo' OR (media_type IS NULL AND LOWER(filetype) IN (${photoExtensionPlaceholders})))
     ORDER BY uploaded_at DESC`,
    [sessionId, ...PHOTO_EXTENSIONS],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
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
        'INSERT INTO uploads (filename, filepath, filetype, session_id, guest_name, media_type) VALUES (?, ?, ?, ?, ?, ?)'
      );

      uploaded.forEach(file => {
        insert.run(file.filename, file.path, getFileExtension(file.originalname), sessionId, guestName, 'photo');
      });

      insert.finalize((finalizeErr) => {
        if (finalizeErr) return res.status(500).json({ error: finalizeErr.message });

        db.all(
          `SELECT *
           FROM uploads
           WHERE session_id = ?
             AND COALESCE(guest_removed, 0) = 0
             AND (media_type = 'photo' OR (media_type IS NULL AND LOWER(filetype) IN (${photoExtensionPlaceholders})))
           ORDER BY uploaded_at DESC`,
          [sessionId, ...PHOTO_EXTENSIONS],
          (photosErr, photoRows) => {
            if (photosErr) return res.status(500).json({ error: photosErr.message });

            res.json({
              success: true,
              files: uploaded,
              photos: photoRows || [],
              remaining: remaining - uploaded.length,
              message: `${uploaded.length} bestanden succesvol geupload`
            });
          }
        );
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
        'INSERT INTO uploads (filename, filepath, filetype, session_id, guest_name, media_type) VALUES (?, ?, ?, ?, ?, ?)',
        [uploaded.filename, uploaded.path, getFileExtension(req.file.originalname), sessionId, guestName, 'video'],
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

app.post('/api/audio-upload', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen spraakbericht geupload' });
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

    if (!isAudioFile(req.file)) {
      removeUploadedFiles([req.file]);
      return res.status(400).json({ error: 'Alleen audio-opnames toegestaan' });
    }

    countUploadsByType(sessionId, 'audio', (err, row) => {
      if (err) {
        removeUploadedFiles([req.file]);
        return res.status(500).json({ error: err.message });
      }

      const currentCount = row?.count || 0;
      const remaining = MAX_AUDIO_UPLOADS_PER_SESSION - currentCount;

      if (remaining <= 0) {
        removeUploadedFiles([req.file]);
        return res.status(400).json({ error: 'Je hebt al 1 spraakbericht geupload' });
      }

      const uploaded = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: `/uploads/${req.file.filename}`
      };

      db.run(
        'INSERT INTO uploads (filename, filepath, filetype, session_id, guest_name, media_type) VALUES (?, ?, ?, ?, ?, ?)',
        [uploaded.filename, uploaded.path, getFileExtension(req.file.originalname), sessionId, guestName, 'audio'],
        (insertErr) => {
          if (insertErr) {
            removeUploadedFiles([req.file]);
            return res.status(500).json({ error: insertErr.message });
          }

          res.json({
            success: true,
            file: uploaded,
            remaining: remaining - 1,
            message: 'Spraakbericht succesvol geupload'
          });
        }
      );
    });
  } catch (error) {
    removeUploadedFiles(req.file ? [req.file] : []);
    console.error('Audio upload error:', error);
    res.status(500).json({ error: 'Spraakbericht upload mislukt' });
  }
});

app.get('/api/spotify/login', async (req, res) => {
  try {
    if (req.query.adminPassword !== ADMIN_PASSWORD) {
      return res.status(401).send('Niet bevoegd');
    }

    const config = getSpotifyConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.status(500).send('SPOTIFY_CLIENT_ID en SPOTIFY_CLIENT_SECRET ontbreken');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = getSpotifyRedirectUri(req);
    await setSetting('spotify_auth_state', state);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('scope', SPOTIFY_SCOPE);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Spotify login error:', error);
    res.status(500).send(error.message);
  }
});

app.get('/api/spotify/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const savedState = await getSetting('spotify_auth_state');

    if (!code || !state || state !== savedState) {
      return res.status(400).send('Spotify state klopt niet, probeer opnieuw te koppelen');
    }

    const config = getSpotifyConfig();
    const token = await requestSpotifyToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getSpotifyRedirectUri(req)
    }), config);

    if (!token.refresh_token) {
      return res.status(500).send('Geen refresh token ontvangen. Verwijder app-toegang in Spotify en probeer opnieuw.');
    }

    await setSetting('spotify_refresh_token', token.refresh_token);
    await setSetting('spotify_auth_state', '');

    res.send(`
      <html>
        <body style="font-family: system-ui; padding: 32px;">
          <h1>Spotify gekoppeld</h1>
          <p>Je kunt dit venster sluiten. Gasten kunnen nu nummers zoeken en toevoegen.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Spotify callback error:', error);
    res.status(500).send(error.message);
  }
});

app.get('/api/spotify/status', async (req, res) => {
  const refreshToken = await getSetting('spotify_refresh_token') || process.env.SPOTIFY_REFRESH_TOKEN;
  const config = getSpotifyConfig();

  res.json({
    configured: Boolean(config.clientId && config.clientSecret && config.playlistId),
    connected: Boolean(refreshToken)
  });
});

app.get('/api/spotify/now-playing', async (req, res) => {
  try {
    const accessToken = await getSpotifyAccessToken();
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status === 204) {
      return res.json({ isPlaying: false, track: null });
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload.error?.message || payload.error_description || payload.error || 'Spotify currently playing ophalen mislukt';
      throw new Error(`Spotify ${response.status}: ${message}`);
    }

    const track = mapSpotifyTrack(payload.item);
    if (!track) {
      return res.json({ isPlaying: Boolean(payload.is_playing), track: null });
    }

    res.json({
      isPlaying: Boolean(payload.is_playing),
      progressMs: payload.progress_ms || 0,
      fetchedAt: Date.now(),
      track
    });
  } catch (error) {
    console.error('Spotify now playing error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/spotify/queue', async (req, res) => {
  try {
    const payload = await spotifyApiFetch('https://api.spotify.com/v1/me/player/queue');
    const queue = Array.isArray(payload.queue)
      ? payload.queue.map(mapSpotifyTrack).filter(Boolean).slice(0, 3)
      : [];

    res.json({ queue });
  } catch (error) {
    console.error('Spotify queue error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Spotify: Get all requests
app.get('/api/spotify/requests', (req, res) => {
  db.all('SELECT * FROM spotify_requests ORDER BY requested_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/spotify/current', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt' });
  }

  db.get(
    'SELECT * FROM spotify_requests WHERE session_id = ? ORDER BY requested_at DESC LIMIT 1',
    [sessionId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row || null);
    }
  );
});

app.delete('/api/spotify/requests/:id', (req, res) => {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Niet bevoegd' });
  }

  const requestId = Number(req.params.id);

  if (!Number.isInteger(requestId)) {
    return res.status(400).json({ error: 'Ongeldig nummer id' });
  }

  db.get('SELECT * FROM spotify_requests WHERE id = ?', [requestId], async (err, requestRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!requestRow) return res.status(404).json({ error: 'Nummer niet gevonden' });

    const trackUri = requestRow.track_uri || (requestRow.track_id ? `spotify:track:${requestRow.track_id}` : '');

    let removedExistingTrack = false;

    try {
      if (requestRow.added_to_playlist && trackUri) {
        await removeSpotifyPlaylistTrack(trackUri);
      }
    } catch (spotifyErr) {
      console.error('Spotify delete track error:', spotifyErr);
      return res.status(500).json({ error: spotifyErr.message });
    }

    db.run('DELETE FROM spotify_requests WHERE id = ?', [requestId], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      res.json({ success: true, message: 'Nummer verwijderd uit playlist' });
    });
  });
});

// Spotify: Search tracks
app.get('/api/spotify/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'Query required' });

    const searchUrl = new URL('https://api.spotify.com/v1/search');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('type', 'track');
    searchUrl.searchParams.set('limit', '8');
    searchUrl.searchParams.set('market', SPOTIFY_MARKET);

    const payload = await spotifyApiFetch(searchUrl.toString());
    const tracks = (payload.tracks?.items || []).map(track => ({
      id: track.id,
      name: track.name,
      artist: track.artists.map(artist => artist.name).join(', '),
      album: track.album?.name || '',
      image: track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '',
      uri: track.uri,
      externalUrl: track.external_urls?.spotify || ''
    }));

    res.json(tracks);
  } catch (error) {
    console.error('Spotify search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Spotify: Add request
app.post('/api/spotify/request', express.json(), (req, res) => {
  const { trackId, trackName, artistName, trackUri, sessionId, guestName } = req.body;
  const cleanSessionId = String(sessionId || '').trim();
  const cleanGuestName = String(guestName || '').trim().replace(/\s+/g, ' ');
  
  if (!trackId || !trackName || !artistName || !trackUri) {
    return res.status(400).json({ error: 'Vereiste velden ontbreken' });
  }

  if (!cleanSessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt, herlaad de pagina en probeer opnieuw' });
  }

  if (!cleanGuestName) {
    return res.status(400).json({ error: 'Vul eerst je naam in' });
  }

  if (!String(trackUri).startsWith('spotify:track:')) {
    return res.status(400).json({ error: 'Ongeldige Spotify track' });
  }

  db.get('SELECT * FROM spotify_requests WHERE session_id = ? ORDER BY requested_at DESC LIMIT 1', [cleanSessionId], async (err, existingRequest) => {
    if (err) return res.status(500).json({ error: err.message });

    const existingTrackUri = existingRequest?.track_uri || (existingRequest?.track_id ? `spotify:track:${existingRequest.track_id}` : '');

    try {
      if (existingRequest && existingTrackUri === trackUri) {
        db.run(
          'UPDATE spotify_requests SET guest_name = ? WHERE id = ?',
          [cleanGuestName, existingRequest.id],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ success: true, changed: false, message: 'Dit nummer stond al klaar' });
          }
        );
        return;
      }

      if (existingRequest && existingRequest.added_to_playlist && existingTrackUri) {
        await removeSpotifyPlaylistTrack(existingTrackUri);
        removedExistingTrack = true;
      }

      const spotifyResponse = await addSpotifyPlaylistTrack(trackUri);

      if (existingRequest) {
        db.run(
          `UPDATE spotify_requests
           SET track_id = ?,
               track_name = ?,
               artist_name = ?,
               track_uri = ?,
               guest_name = ?,
               added_to_playlist = ?,
               snapshot_id = ?,
               requested_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [trackId, trackName, artistName, trackUri, cleanGuestName, 1, spotifyResponse.snapshot_id || null, existingRequest.id],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ success: true, changed: true, message: 'Nummer gewijzigd in playlist' });
          }
        );
        return;
      }

      db.run(
        `INSERT INTO spotify_requests
          (track_id, track_name, artist_name, track_uri, session_id, guest_name, added_to_playlist, snapshot_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [trackId, trackName, artistName, trackUri, cleanSessionId, cleanGuestName, 1, spotifyResponse.snapshot_id || null],
        (insertErr) => {
          if (insertErr) return res.status(500).json({ error: insertErr.message });
          res.json({ success: true, message: 'Nummer toegevoegd aan playlist' });
        }
      );
    } catch (spotifyErr) {
      if (removedExistingTrack && existingTrackUri) {
        try {
          await addSpotifyPlaylistTrack(existingTrackUri);
        } catch (restoreErr) {
          console.error('Spotify restore previous track error:', restoreErr);
        }
      }

      console.error('Spotify add track error:', spotifyErr);
      res.status(500).json({ error: spotifyErr.message });
    }
  });
});

app.get('/api/spotify/count', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt' });
  }

  db.get('SELECT COUNT(*) AS count FROM spotify_requests WHERE session_id = ?', [sessionId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    const count = row?.count || 0;
    res.json({
      count,
      remaining: Math.max(0, 1 - count),
      limit: 1
    });
  });
});

app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM guest_messages ORDER BY updated_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/messages/current', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt' });
  }

  db.get('SELECT * FROM guest_messages WHERE session_id = ?', [sessionId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || null);
  });
});

app.post('/api/messages', (req, res) => {
  const sessionId = String(req.body.sessionId || '').trim();
  const guestName = String(req.body.guestName || '').trim().replace(/\s+/g, ' ');
  const message = String(req.body.message || '').trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt, herlaad de pagina en probeer opnieuw' });
  }

  if (!guestName) {
    return res.status(400).json({ error: 'Vul eerst je naam in' });
  }

  if (guestName.length > MAX_GUEST_NAME_LENGTH) {
    return res.status(400).json({ error: `Naam mag maximaal ${MAX_GUEST_NAME_LENGTH} tekens zijn` });
  }

  if (!message) {
    return res.status(400).json({ error: 'Schrijf eerst een boodschap' });
  }

  if (message.length > MAX_TEXT_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Boodschap mag maximaal ${MAX_TEXT_MESSAGE_LENGTH} tekens zijn` });
  }

  db.run(
    `INSERT INTO guest_messages (session_id, guest_name, message)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       guest_name = excluded.guest_name,
       message = excluded.message,
       updated_at = CURRENT_TIMESTAMP`,
    [sessionId, guestName, message],
    function saveMessage(err) {
      if (err) return res.status(500).json({ error: err.message });

      db.get('SELECT * FROM guest_messages WHERE session_id = ?', [sessionId], (selectErr, row) => {
        if (selectErr) return res.status(500).json({ error: selectErr.message });
        res.json({ success: true, message: 'Boodschap opgeslagen', data: row });
      });
    }
  );
});

app.delete('/api/messages/:id', (req, res) => {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Niet bevoegd' });
  }

  const messageId = Number(req.params.id);

  if (!Number.isInteger(messageId)) {
    return res.status(400).json({ error: 'Ongeldig bericht id' });
  }

  db.run('DELETE FROM guest_messages WHERE id = ?', [messageId], function deleteMessage(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Boodschap niet gevonden' });
    res.json({ success: true, message: 'Boodschap verwijderd' });
  });
});

// Get all uploads
app.get('/api/uploads', (req, res) => {
  db.all('SELECT * FROM uploads ORDER BY uploaded_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/uploads/photos.zip', (req, res) => {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Niet bevoegd' });
  }

  db.all(
    `SELECT *
     FROM uploads
     WHERE media_type = 'photo'
        OR (media_type IS NULL AND LOWER(filetype) IN (${photoExtensionPlaceholders}))
     ORDER BY uploaded_at ASC`,
    [...PHOTO_EXTENSIONS],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      try {
        const usedNames = new Set();
        const entries = [];

        for (const row of rows || []) {
          const storedFilename = path.basename(row.filepath || row.filename || '');
          if (!storedFilename) continue;

          const fullPath = path.join(uploadDir, storedFilename);
          const stat = await fs.promises.stat(fullPath).catch(() => null);
          if (!stat?.isFile()) continue;
          if (stat.size > 0xffffffff) {
            return res.status(500).json({ error: 'Een foto is te groot voor deze zip export' });
          }

          const guestName = sanitizeZipSegment(row.guest_name, 'Onbekend');
          const uploadedDate = String(row.uploaded_at || '').slice(0, 10) || 'zonder-datum';
          const safeFilename = sanitizeZipSegment(row.filename || storedFilename, `foto-${row.id}.${row.filetype || 'jpg'}`);
          let zipPath = `fotos/${uploadedDate}-${row.id}-${guestName}-${safeFilename}`;
          let duplicateIndex = 2;

          while (usedNames.has(zipPath)) {
            zipPath = `fotos/${uploadedDate}-${row.id}-${guestName}-${duplicateIndex}-${safeFilename}`;
            duplicateIndex += 1;
          }

          usedNames.add(zipPath);
          const crc32 = await calculateFileCrc32(fullPath);
          const { date: dosDate, time: dosTime } = toDosDateTime(row.uploaded_at);

          entries.push({
            crc32,
            dosDate,
            dosTime,
            fullPath,
            size: stat.size,
            zipPath
          });
        }

        if (entries.length === 0) {
          return res.status(404).json({ error: 'Geen foto\'s gevonden om te exporteren' });
        }

        let offset = 0;
        for (const entry of entries) {
          entry.offset = offset;
          entry.localHeader = createZipLocalHeader(entry);
          offset += entry.localHeader.length + entry.size;
        }

        const centralOffset = offset;
        const centralHeaders = entries.map(createZipCentralHeader);
        const centralSize = centralHeaders.reduce((total, header) => total + header.length, 0);
        const endRecord = createZipEndRecord(entries.length, centralSize, centralOffset);
        const contentLength = centralOffset + centralSize + endRecord.length;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="trouw-fotos.zip"');
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        for (const entry of entries) {
          res.write(entry.localHeader);
          await streamFileToResponse(entry.fullPath, res);
        }

        for (const header of centralHeaders) {
          res.write(header);
        }

        res.end(endRecord);
      } catch (exportErr) {
        console.error('Photo zip export error:', exportErr);
        if (res.headersSent) return res.destroy(exportErr);
        return res.status(500).json({ error: 'Foto export mislukt' });
      }
    }
  );
});

app.get('/api/uploads/videos.zip', (req, res) => {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Niet bevoegd' });
  }

  db.all(
    `SELECT *
     FROM uploads
     WHERE media_type = 'video'
        OR (media_type IS NULL AND LOWER(filetype) IN (${videoExtensionPlaceholders}))
     ORDER BY uploaded_at ASC`,
    [...VIDEO_EXTENSIONS],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      try {
        const usedNames = new Set();
        const entries = [];

        for (const row of rows || []) {
          const storedFilename = path.basename(row.filepath || row.filename || '');
          if (!storedFilename) continue;

          const fullPath = path.join(uploadDir, storedFilename);
          const stat = await fs.promises.stat(fullPath).catch(() => null);
          if (!stat?.isFile()) continue;
          if (stat.size > 0xffffffff) {
            return res.status(500).json({ error: 'Een video is te groot voor deze zip export' });
          }

          const guestName = sanitizeZipSegment(row.guest_name, 'Onbekend');
          const uploadedDate = String(row.uploaded_at || '').slice(0, 10) || 'zonder-datum';
          const safeFilename = sanitizeZipSegment(row.filename || storedFilename, `video-${row.id}.${row.filetype || 'mp4'}`);
          let zipPath = `videos/${uploadedDate}-${row.id}-${guestName}-${safeFilename}`;
          let duplicateIndex = 2;

          while (usedNames.has(zipPath)) {
            zipPath = `videos/${uploadedDate}-${row.id}-${guestName}-${duplicateIndex}-${safeFilename}`;
            duplicateIndex += 1;
          }

          usedNames.add(zipPath);
          const crc32 = await calculateFileCrc32(fullPath);
          const { date: dosDate, time: dosTime } = toDosDateTime(row.uploaded_at);

          entries.push({
            crc32,
            dosDate,
            dosTime,
            fullPath,
            size: stat.size,
            zipPath
          });
        }

        if (entries.length === 0) {
          return res.status(404).json({ error: 'Geen video\'s gevonden om te exporteren' });
        }

        let offset = 0;
        for (const entry of entries) {
          entry.offset = offset;
          entry.localHeader = createZipLocalHeader(entry);
          offset += entry.localHeader.length + entry.size;
        }

        const centralOffset = offset;
        const centralHeaders = entries.map(createZipCentralHeader);
        const centralSize = centralHeaders.reduce((total, header) => total + header.length, 0);
        const endRecord = createZipEndRecord(entries.length, centralSize, centralOffset);
        const contentLength = centralOffset + centralSize + endRecord.length;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="trouw-videos.zip"');
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        for (const entry of entries) {
          res.write(entry.localHeader);
          await streamFileToResponse(entry.fullPath, res);
        }

        for (const header of centralHeaders) {
          res.write(header);
        }

        res.end(endRecord);
      } catch (exportErr) {
        console.error('Video zip export error:', exportErr);
        if (res.headersSent) return res.destroy(exportErr);
        return res.status(500).json({ error: 'Video export mislukt' });
      }
    }
  );
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

app.delete('/api/uploads/:id/mine', (req, res) => {
  const uploadId = Number(req.params.id);
  const sessionId = String(req.body?.sessionId || req.query.sessionId || '').trim();

  if (!Number.isInteger(uploadId)) {
    return res.status(400).json({ error: 'Ongeldig upload id' });
  }

  if (!sessionId) {
    return res.status(400).json({ error: 'Sessie ontbreekt' });
  }

  db.get('SELECT * FROM uploads WHERE id = ? AND session_id = ?', [uploadId, sessionId], async (err, uploadRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!uploadRow) return res.status(404).json({ error: 'Foto niet gevonden voor deze sessie' });

    const uploadType = uploadRow.media_type || (PHOTO_EXTENSIONS.includes(String(uploadRow.filetype || '').toLowerCase()) ? 'photo' : 'file');
    if (uploadType !== 'photo') {
      return res.status(400).json({ error: 'Alleen eigen foto\'s kunnen hier verwijderd worden' });
    }

    db.run('UPDATE uploads SET guest_removed = 1 WHERE id = ? AND session_id = ?', [uploadId, sessionId], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });

      countUploadsByType(sessionId, 'photo', (countErr, row) => {
        if (countErr) return res.status(500).json({ error: countErr.message });

        const count = row?.count || 0;
        res.json({
          success: true,
          message: 'Foto verwijderd uit jouw selectie',
          count,
          remaining: Math.max(0, MAX_PHOTO_UPLOADS_PER_SESSION - count),
          limit: MAX_PHOTO_UPLOADS_PER_SESSION
        });
      });
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
