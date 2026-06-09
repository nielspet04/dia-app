import { useRef, useState } from 'react';
import './App.css';
import UploadMedia from './components/UploadMedia';
import AdminGallery from './components/AdminGallery';
import AdminSlideshow from './components/AdminSlideshow';
import { getSavedGuestName, MAX_GUEST_NAME_LENGTH, saveGuestName } from './uploadSession';

const ADMIN_PASSWORD = 'DiaInstituut123';

function App() {
  const [guestName, setGuestName] = useState(getSavedGuestName);
  const [adminMode, setAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminAuth, setAdminAuth] = useState('');
  const [adminView, setAdminView] = useState('gallery');
  const guestNameInputRef = useRef(null);

  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setAdminAuth(adminPassword);
      setAdminPassword('');
      setAdminView('gallery');
      return;
    }

    alert('Onjuist wachtwoord');
  };

  const handleAdminLogout = () => {
    setAdminUnlocked(false);
    setAdminMode(false);
    setAdminAuth('');
    setAdminPassword('');
    setAdminView('gallery');
  };

  if (adminUnlocked && adminView === 'slideshow') {
    return (
      <AdminSlideshow
        onExit={() => setAdminView('gallery')}
        onLogout={handleAdminLogout}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <img
          className="school-logo"
          src="/dia-arcadia-logo.png"
          alt="DIA Arcadia Damiaaninstituut Aarschot"
        />
        <p className="hero-kicker">Damiaaninstituut Aarschot</p>
        <h1>Deel jouw mooiste herinneringen! 📸</h1>
        <div className="intro-text">
          <p>
            Tijdens de proclamatie van de zesdejaars op 25 juni willen we samen
            terugblikken op alle mooie momenten van de voorbije schooljaren.
            Daarom vragen we jullie om jullie leukste foto's te uploaden via dit formulier.
          </p>
          <p>
            Denk aan foto's van uitstappen, activiteiten, projecten, klasmomenten,
            vrienden of andere herinneringen die voor jou bijzonder zijn. Een selectie
            van de ingezonden foto's wordt getoond tijdens de proclamatie.
          </p>
          <p>
            Alvast bedankt voor jullie bijdrage en veel plezier met het herbeleven
            van deze mooie herinneringen! 🎓✨
          </p>
        </div>
      </header>

      {adminUnlocked ? (
        <>
          <nav className="admin-view-switch" aria-label="Admin weergave">
            <button
              type="button"
              className={`filter-btn ${adminView === 'gallery' ? 'active' : ''}`}
              onClick={() => setAdminView('gallery')}
            >
              Beheer
            </button>
            <button
              type="button"
              className={`filter-btn ${adminView === 'slideshow' ? 'active' : ''}`}
              onClick={() => setAdminView('slideshow')}
            >
              Slideshow
            </button>
          </nav>
          <main className="content">
            <AdminGallery adminPassword={adminAuth} />
          </main>
          <button type="button" className="logout-btn" onClick={handleAdminLogout}>
            Uitloggen
          </button>
        </>
      ) : (
        <>
          <section className="guest-name-panel">
            <label className="guest-name-label" htmlFor="guest-name">
              Volledige naam
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
              placeholder="Voornaam en familienaam"
              required
            />
          </section>

          <main className="content">
            <UploadMedia guestName={guestName} />
          </main>

          <footer className="app-footer">
            <button
              type="button"
              onClick={() => setAdminMode((isOpen) => !isOpen)}
              className="admin-toggle"
              aria-label="Admin"
            >
              Beheer
            </button>

            {adminMode && (
              <section className="admin-login" aria-label="Admin login">
                <h2>Admin login</h2>
                <input
                  type="password"
                  placeholder="Wachtwoord"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdminLogin();
                  }}
                />
                <div className="admin-login-actions">
                  <button type="button" onClick={handleAdminLogin}>Inloggen</button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setAdminMode(false);
                      setAdminPassword('');
                    }}
                  >
                    Annuleren
                  </button>
                </div>
              </section>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

export default App;
