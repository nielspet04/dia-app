import { useState } from 'react';
import './App.css';
import UploadMedia from './components/UploadMedia';
import UploadVideo from './components/UploadVideo';
import SpotifyRequest from './components/SpotifyRequest';
import AdminGallery from './components/AdminGallery';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminAuth, setAdminAuth] = useState('');

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
              className={`tab ${activeTab === 'spotify' ? 'active' : ''}`}
              onClick={() => setActiveTab('spotify')}
            >
              🎵 Request Nummer
            </button>
          </nav>

          <main className="content">
            {activeTab === 'upload' && <UploadMedia />}
            {activeTab === 'video' && <UploadVideo />}
            {activeTab === 'spotify' && <SpotifyRequest />}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
