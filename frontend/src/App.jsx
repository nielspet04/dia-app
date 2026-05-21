import { useRef, useState } from 'react';
import './App.css';
import UploadMedia from './components/UploadMedia';
import UploadVideo from './components/UploadVideo';
import UploadVoice from './components/UploadVoice';
import TextMessage from './components/TextMessage';
import SpotifyRequest from './components/SpotifyRequest';
import AdminGallery from './components/AdminGallery';
import AdminSlideshow from './components/AdminSlideshow';
import { getSavedGuestName, MAX_GUEST_NAME_LENGTH, resetUploadSession, saveGuestName } from './uploadSession';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminAuth, setAdminAuth] = useState('');
  const [adminView, setAdminView] = useState('gallery');
  const [guestName, setGuestName] = useState(getSavedGuestName);
  const guestNameInputRef = useRef(null);

  const hasGuestName = guestName.trim().length > 0;
  const isSlideshowMode = adminUnlocked && adminView === 'slideshow';

  const handleAdminLogin = (password) => {
    // Simple password check - change this to your desired password
    if (password === 'guyenria123') {
      setAdminUnlocked(true);
      setAdminMode(true);
      setAdminView('gallery');
      setAdminAuth(password);
      setAdminPassword('');
    } else {
      alert('Onjuist wachtwoord');
    }
  };

  const requireGuestName = (nextTab) => {
    if (!hasGuestName) {
      alert('Vul eerst je naam in voordat je verdergaat.');
      guestNameInputRef.current?.focus();
      return;
    }

    setActiveTab(nextTab);
  };

  const handleResetCurrentDevice = () => {
    const confirmed = window.confirm('Nieuwe gast-sessie maken voor dit apparaat? Hiermee kun je vanaf deze browser opnieuw testen.');
    if (!confirmed) return;

    resetUploadSession();
    setActiveTab('upload');
    setAdminUnlocked(false);
    setAdminMode(false);
    setAdminAuth('');
    setAdminView('gallery');
    alert('Nieuwe gast-sessie aangemaakt voor dit apparaat.');
  };

  return (
    <div className={`app ${isSlideshowMode ? 'app-slideshow-mode' : ''}`}>
      {!isSlideshowMode && (
      <header className="header">
        <div className="hero-sparkles" aria-hidden="true" />
        <p className="hero-kicker">Jouw momenten, ons gastenboek</p>
        <h1>Trouw van Guy en Ria</h1>
        <div className="intro-text">
          <p>
            Help ons een digitaal gastenboek vol echte momenten te maken. Deel je mooiste,
            grappigste en zotste foto's of video, spreek of schrijf een bericht en request
            het nummer dat volgens jou niet mag ontbreken op het feest.
          </p>
          <p>
            Per gast kan je maximaal 5 foto's, 1 video, 1 spraakbericht en 1 liedje insturen.
            Je liedje wordt meteen toegevoegd aan onze Spotify playlist.
          </p>
          <div className="intro-limits" aria-label="Mogelijkheden en limieten">
            <span>Foto's: max. 5</span>
            <span>Video: max. 1</span>
            <span>Spraak: max. 1</span>
            <span>Tekst: max. 1</span>
            <span>Liedje: max. 1</span>
          </div>
        </div>
      </header>
      )}

      {adminMode && adminUnlocked && adminView === 'slideshow' ? (
        <AdminSlideshow
          onExit={() => setAdminView('gallery')}
          onLogout={() => { setAdminUnlocked(false); setAdminMode(false); setAdminAuth(''); setAdminView('gallery'); }}
        />
      ) : adminMode && adminUnlocked ? (
        <>
          <div className="admin-view-switch">
            <button type="button" className="filter-btn active">Beheer</button>
            <button type="button" className="filter-btn" onClick={() => setAdminView('slideshow')}>
              Slideshow
            </button>
          </div>
          <AdminGallery adminPassword={adminAuth} />
          <button
            onClick={handleResetCurrentDevice}
            className="admin-reset-btn"
          >
            Nieuwe testsessie voor dit apparaat
          </button>
          <button 
            onClick={() => { setAdminUnlocked(false); setAdminMode(false); setAdminAuth(''); setAdminView('gallery'); }}
            className="logout-btn"
          >
            Uitloggen
          </button>
        </>
      ) : (
        <>
          <section className="guest-name-panel">
            <label className="guest-name-label" htmlFor="guest-name">
              Jouw volledige naam
            </label>
            <input
              id="guest-name"
              ref={guestNameInputRef}
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
              className={`tab ${activeTab === 'upload' ? 'active' : ''} ${!hasGuestName ? 'disabled' : ''}`}
              onClick={() => requireGuestName('upload')}
              aria-disabled={!hasGuestName}
            >
              Foto's
            </button>
            <button
              className={`tab ${activeTab === 'video' ? 'active' : ''} ${!hasGuestName ? 'disabled' : ''}`}
              onClick={() => requireGuestName('video')}
              aria-disabled={!hasGuestName}
            >
              Video
            </button>
            <button 
              className={`tab ${activeTab === 'voice' ? 'active' : ''} ${!hasGuestName ? 'disabled' : ''}`}
              onClick={() => requireGuestName('voice')}
              aria-disabled={!hasGuestName}
            >
              Bericht
            </button>
            <button
              className={`tab ${activeTab === 'text' ? 'active' : ''} ${!hasGuestName ? 'disabled' : ''}`}
              onClick={() => requireGuestName('text')}
              aria-disabled={!hasGuestName}
            >
              Boodschap
            </button>
            <button 
              className={`tab ${activeTab === 'spotify' ? 'active' : ''} ${!hasGuestName ? 'disabled' : ''}`}
              onClick={() => requireGuestName('spotify')}
              aria-disabled={!hasGuestName}
            >
              Request nummer
            </button>
          </nav>

          <main className="content">
            {activeTab === 'upload' && <UploadMedia guestName={guestName} />}
            {activeTab === 'video' && <UploadVideo guestName={guestName} />}
            {activeTab === 'voice' && <UploadVoice guestName={guestName} />}
            {activeTab === 'text' && <TextMessage guestName={guestName} />}
            {activeTab === 'spotify' && <SpotifyRequest guestName={guestName} />}
          </main>
        </>
      )}

      {!adminUnlocked && (
        <footer className="app-footer">
          <div className="footer-decoration" aria-hidden="true" />
          <button
            onClick={() => setAdminMode(!adminMode)}
            className="admin-toggle"
            aria-label="Admin"
          >
            Beheer
          </button>

          {adminMode && (
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
        </footer>
      )}
    </div>
  );
}

export default App;
