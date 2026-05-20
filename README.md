# 🎉 Trouwfeest Web App

Een volledig functionele web applicatie voor je trouwfeest met:
- **📸 Media Uploads** - Gasten kunnen foto's en video's uploaden via QR code
- **🎵 Spotify Integratie** - Nummers aanvragen die automatisch aan een playlist worden toegevoegd
- **📱 Mobiel Responsive** - Werkt perfect op telefoons

## 📋 Vereisten

- Node.js 16+
- npm
- Spotify Premium Account (voor playlist beheer)

## 🚀 Snelle Start

### 1. Backend Starten

```bash
cd backend
npm install
npm start
```

De backend draait op `http://localhost:5000`

### 2. Frontend Starten (nieuw terminal)

```bash
cd frontend
npm install
npm run dev
```

De frontend is beschikbaar op `http://localhost:5173`

Als je de Vite dev server vanaf een andere computer/telefoon wilt openen:

```bash
cd frontend
npm run dev:host
```

Open dan `http://YOUR_IP:5173`.

## 🌍 UpCloud / Server Deploy

Voor de simpelste server setup kun je de frontend bouwen en via de backend op poort `5000` serveren:

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
NODE_ENV=production npm start
```

Open daarna:

```text
http://YOUR_IP:5000/
```

Controleer op de server of de backend echt luistert:

```bash
curl http://localhost:5000/api/health
ss -ltnp | grep 5000
```

Als dit lokaal werkt maar niet via het publieke IP, staat bijna zeker de firewall dicht. Op Ubuntu:

```bash
sudo ufw allow 5000/tcp
sudo ufw status
```

Gebruik je de Vite dev server op poort `5173`, open dan ook die poort en start Vite met `npm run dev:host`.

## 📝 QR Code Genereren

Maak een QR code die naar deze URL wijst:
```
http://YOUR_IP:5000
```

Print deze QR codes en plaats ze op de tafels!

## 🎵 Spotify Setup (Volgende Stap)

1. Ga naar https://developer.spotify.com
2. Registreer een app
3. Kopieer `Client ID` en `Client Secret`
4. Update `backend/.env`:
   ```
   SPOTIFY_CLIENT_ID=your_id
   SPOTIFY_CLIENT_SECRET=your_secret
   ```

## 📂 Folder Structuur

```
trouw-app/
├── frontend/          # React Vite app
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── QRScanner.jsx
│       │   ├── UploadMedia.jsx
│       │   └── SpotifyRequest.jsx
│       └── App.css
│
└── backend/          # Express.js API
    ├── server.js
    ├── trouw.db      # SQLite database
    └── uploads/      # Media storage
```

## 🔧 API Endpoints

### Media
- `POST /api/upload` - Upload fotos/video's
- `GET /api/uploads` - Alle uploads ophalen

### Spotify
- `POST /api/spotify/request` - Nummer aanvragen
- `GET /api/spotify/requests` - Alle aanvragen ophalen
- `GET /api/spotify/search` - Nummers zoeken

## 💡 Notities

- Alle uploads worden opgeslagen in `backend/uploads/`
- Database is SQLite3 (`backend/trouw.db`)
- Max bestandsgrootte: 100MB per bestand
- QR scanner vereist cameratoegang

## 🎬 Video Compilatie

Na het feest kunnen alle uploads worden gebruikt voor een videoclip:
1. Haal alle bestanden uit `backend/uploads/`
2. Gebruik FFmpeg of Adobe Premiere voor montage
3. Voeg muziek toe (van de Spotify playlist!)

## 🆘 Troubleshooting

**CORS Errors?**
- Frontend en backend gebruiken standaard `localhost:5173` en `localhost:5000`
- Voor andere netwerken: update `backend/server.js` CORS origin

**Camera werkt niet?**
- HTTPS nodig voor HTTPS sites
- On localhost werkt het prima

**Spotify niet geconfigueerd?**
- Nummers kunnen nog steeds aangevraagd worden
- Manuele toevoeging aan playlist is ook mogelijk

## 📄 Licentie

Free to use! Veel plezier op het feest! 🎉
