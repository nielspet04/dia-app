import { useState } from 'react';
import './App.css';
import UploadMedia from './components/UploadMedia';
import UploadVideo from './components/UploadVideo';
import UploadVoice from './components/UploadVoice';
import SpotifyRequest from './components/SpotifyRequest';
import AdminGallery from './components/AdminGallery';
import { getSavedGuestName, MAX_GUEST_NAME_LENGTH, saveGuestName } from './uploadSession';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminAuth, setAdminAuth] = useState('');
  const [guestName, setGuestName] = useState(getSavedGuestName);

  const handleAdminLogin = (password) => {
    // Simple password check - change this to your desired password
    if (password === 'guyenria123') {
      setAdminUnlocked(true);
      setAdminMode(true);
      setAdminAuth(password);
      setAdminPassword('');
    } else {
      alert('Onjuist wachtwoord');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🎉 Trouwfeest App</h1>
        <p>Deel fotos, video's en request nummers!</p>
        <button 
          onClick={() => setAdminMode(!adminMode)}
          style={{ marginTop: '15px', fontSize: '0.8em', opacity: 0.6 }}
        >
          👤
        </button>
      </header>

      {adminMode && !adminUnlocked && (
        <div className="admin-login">
          <h2>Admin Panel</h2>
          <input
            type="password"
            placeholder="Voer wachtwoord in"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin(adminPassword)}
          />
          <button onClick={() => handleAdminLogin(adminPassword)}>Inloggen</button>
          <button onClick={() => { setAdminMode(false); setAdminPassword(''); }}>Annuleren</button>
        </div>
      )}

      {adminMode && adminUnlocked ? (
        <>
          <AdminGallery adminPassword={adminAuth} />
          <button 
            onClick={() => { setAdminUnlocked(false); setAdminMode(false); setAdminAuth(''); }}
            className="logout-btn"
          >
            Uitloggen
          </button>
        </>
      ) : (
        <>
          <section className="guest-name-panel">
            <label className="guest-name-label" htmlFor="guest-name">
              Jouw naam
            </label>
            <input
              id="guest-name"
              className="guest-name-input"
              type="text"
              value={guestName}
              maxLength={MAX_GUEST_NAME_LENGTH}
              onChange={(e) => {
                setGuestName(e.target.value);
                saveGuestName(e.target.value);
              }}
              placeholder="Bijvoorbeeld: Niels"
              required
            />
          </section>

          <nav className="tabs">
            <button 
              className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              📸 Foto's
            </button>
            <button
              className={`tab ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              🎬 Video
            </button>
            <button 
              className={`tab ${activeTab === 'voice' ? 'active' : ''}`}
              onClick={() => setActiveTab('voice')}
            >
              🎙️ Bericht
            </button>
            <button 
              className={`tab ${activeTab === 'spotify' ? 'active' : ''}`}
              onClick={() => setActiveTab('spotify')}
            >
              🎵 Request Nummer
            </button>
          </nav>

          <main className="content">
            {activeTab === 'upload' && <UploadMedia guestName={guestName} />}
            {activeTab === 'video' && <UploadVideo guestName={guestName} />}
            {activeTab === 'voice' && <UploadVoice guestName={guestName} />}
            {activeTab === 'spotify' && <SpotifyRequest guestName={guestName} />}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
