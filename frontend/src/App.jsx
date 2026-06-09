import { useRef, useState } from 'react';
import './App.css';
import UploadMedia from './components/UploadMedia';
import { getSavedGuestName, MAX_GUEST_NAME_LENGTH, saveGuestName } from './uploadSession';

function App() {
  const [guestName, setGuestName] = useState(getSavedGuestName);
  const guestNameInputRef = useRef(null);

  return (
    <div className="app">
      <header className="header">
        <img
          className="school-logo"
          src="/dia-arcadia-logo.png"
          alt="DIA Arcadia Damiaaninstituut Aarschot"
        />
        <p className="hero-kicker">Damiaaninstituut Aarschot</p>
        <h1>Foto toevoegen</h1>
        <div className="intro-text">
          <p>
            Upload eenvoudig een foto voor DIA Arcadia. Vul je naam in, kies een foto
            en verzend ze veilig naar de schoolgalerij.
          </p>
        </div>
      </header>

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
    </div>
  );
}

export default App;
