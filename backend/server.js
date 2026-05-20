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
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 250);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'guyenria123';
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'];
const AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp3', 'wav', 'ogg'];
const SPOTIFY_SCOPE = 'playlist-modify-public playlist-modify-private';
const SPOTIFY_MARKET = process.env.SPOTIFY_MARKET || 'BE';
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

const getSpotifyConfig = () => ({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  playlistId: process.env.SPOTIFY_PLAYLIST_ID
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
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error || 'Spotify request mislukt');
  }

  return payload;
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
      media_type TEXT
    )
  `);

  db.all('PRAGMA table_info(uploads)', (err, columns) => {
    if (err) return console.error('Failed to inspect uploads table:', err);

    const hasGuestName = columns.some(column => column.name === 'guest_name');
    const hasMediaType = columns.some(column => column.name === 'media_type');
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

// Spotify: Get all requests
app.get('/api/spotify/requests', (req, res) => {
  db.all('SELECT * FROM spotify_requests ORDER BY requested_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
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

  db.get('SELECT COUNT(*) AS count FROM spotify_requests WHERE session_id = ?', [cleanSessionId], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if ((row?.count || 0) >= 1) {
      return res.status(400).json({ error: 'Je hebt al 1 nummer aangevraagd' });
    }

    try {
      const config = requireSpotifyConfig();
      const spotifyResponse = await spotifyApiFetch(
        `https://api.spotify.com/v1/playlists/${config.playlistId}/items`,
        {
          method: 'POST',
          body: JSON.stringify({ uris: [trackUri] })
        }
      );

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
