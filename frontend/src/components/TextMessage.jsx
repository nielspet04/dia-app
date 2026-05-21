import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { getUploadSessionId, saveGuestName } from '../uploadSession';

const MAX_MESSAGE_LENGTH = 800;

export default function TextMessage({ guestName }) {
  const [messageText, setMessageText] = useState('');
  const [savedMessage, setSavedMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [sessionId] = useState(getUploadSessionId);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentMessage = async () => {
      try {
        const response = await axios.get(`${API_BASE}/messages/current`, {
          params: { sessionId }
        });

        if (isMounted && response.data) {
          setSavedMessage(response.data);
          setMessageText(response.data.message || '');
        }
      } catch (error) {
        console.error('Failed to load current text message:', error);
      }
    };

    loadCurrentMessage();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanGuestName = guestName.trim().replace(/\s+/g, ' ');
    const cleanMessage = messageText.trim();

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je een boodschap schrijft.');
      setMessage('Vul eerst je naam in');
      return;
    }

    if (!cleanMessage) {
      setMessage('Schrijf eerst een boodschap');
      return;
    }

    if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
      setMessage(`Je boodschap mag maximaal ${MAX_MESSAGE_LENGTH} tekens zijn`);
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      saveGuestName(cleanGuestName);
      const response = await axios.post(`${API_BASE}/messages`, {
        sessionId,
        guestName: cleanGuestName,
        message: cleanMessage
      });

      setSavedMessage(response.data.data);
      setMessageText(response.data.data?.message || cleanMessage);
      setMessage(savedMessage ? 'Boodschap bijgewerkt' : 'Boodschap opgeslagen');
    } catch (error) {
      setMessage(`Opslaan mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Text message save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const remainingCharacters = MAX_MESSAGE_LENGTH - messageText.length;

  return (
    <div className="upload-media">
      <div className="upload-box text-message-box">
        <h3>Schrijf een boodschap</h3>
        <p className="upload-hint">
          Laat een wens, herinnering of lieve boodschap achter voor Guy en Ria.
          Je kunt je boodschap later nog aanpassen.
        </p>

        {savedMessage && (
          <div className="current-song text-message-current">
            <p className="current-song-label">Jouw huidige boodschap</p>
            <p className="text-message-preview">{savedMessage.message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <textarea
            className="text-message-input"
            value={messageText}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Schrijf hier je boodschap..."
            disabled={saving || !guestName.trim()}
          />
          <p className="character-count">{remainingCharacters} tekens over</p>
          <button
            type="submit"
            className="upload-btn"
            disabled={saving || !guestName.trim() || !messageText.trim()}
          >
            {saving ? 'Opslaan...' : (savedMessage ? 'Boodschap aanpassen' : 'Boodschap opslaan')}
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}
