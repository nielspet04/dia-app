import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { getUploadSessionId, saveGuestName } from '../uploadSession';

export default function SpotifyRequest({ guestName }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState('');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [sessionId] = useState(getUploadSessionId);
  const [remainingRequests, setRemainingRequests] = useState(1);

  useEffect(() => {
    const loadRequestCount = async () => {
      try {
        const response = await axios.get(`${API_BASE}/spotify/count`, {
          params: { sessionId }
        });
        setRemainingRequests(response.data.remaining);
      } catch (error) {
        console.error('Failed to load Spotify request count:', error);
      }
    };

    loadRequestCount();
  }, [sessionId]);

  const handleSearch = async (e) => {
    e.preventDefault();
    const cleanGuestName = guestName.trim();

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je een nummer zoekt.');
      setMessage('⚠️ Vul eerst je naam in');
      return;
    }

    if (remainingRequests <= 0) {
      setMessage('⚠️ Je hebt al 1 nummer aangevraagd');
      return;
    }

    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await axios.get(`${API_BASE}/spotify/search`, {
        params: { q: searchQuery }
      });
      setResults(response.data || []);
      setMessage(response.data?.length ? '' : 'Geen resultaten gevonden');
    } catch (error) {
      setMessage(`❌ Zoeken mislukt: ${error.response?.data?.error || error.message}`);
    } finally {
      setSearching(false);
    }
  };

  const handleAddRequest = async (track) => {
    const cleanGuestName = guestName.trim().replace(/\s+/g, ' ');

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je een nummer toevoegt.');
      setMessage('⚠️ Vul eerst je naam in');
      return;
    }

    try {
      setAddingTrackId(track.id);
      saveGuestName(cleanGuestName);
      await axios.post(`${API_BASE}/spotify/request`, {
        trackId: track.id,
        trackName: track.name,
        artistName: track.artist,
        trackUri: track.uri,
        sessionId,
        guestName: cleanGuestName
      });

      setMessage(`✅ "${track.name}" toegevoegd aan playlist!`);
      setRemainingRequests(0);
      setSearchQuery('');
      setResults([]);
      loadRequests();

      setTimeout(() => {
        setMessage('');
      }, 2000);
    } catch (error) {
      setMessage(`❌ Kon nummer niet toevoegen: ${error.response?.data?.error || error.message}`);
      console.error('Request error:', error);
    } finally {
      setAddingTrackId('');
    }
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await axios.get(`${API_BASE}/spotify/requests`);
      setRequests(response.data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  };

  return (
    <div className="spotify-request">
      <div className="search-box">
        <h3>🎵 Request een nummer</h3>
        <p className="upload-hint">Nog {remainingRequests} van 1 nummer beschikbaar</p>

        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Zoek een nummernaam of artiest..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={searching || remainingRequests <= 0}
          />
          <button type="submit" disabled={searching || remainingRequests <= 0}>
            {searching ? '🔍 Zoeken...' : '🔍 Zoeken'}
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        {results.length > 0 && (
          <div className="results">
            <h4>Zoekresultaten:</h4>
            {results.map((track) => (
              <div key={track.id} className="track-item">
                {track.image && (
                  <img className="track-image" src={track.image} alt="" loading="lazy" />
                )}
                <div className="track-info">
                  <p className="track-name">{track.name}</p>
                  <p className="track-artist">{track.artist}</p>
                  {track.album && <p className="track-album">{track.album}</p>}
                </div>
                <button
                  onClick={() => handleAddRequest(track)}
                  className="add-btn"
                  disabled={addingTrackId === track.id || remainingRequests <= 0}
                >
                  {addingTrackId === track.id ? 'Toevoegen...' : '➕ Toevoegen'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="requests-box">
        <h3>📋 Aangevraagde nummers</h3>
        <button onClick={loadRequests} className="refresh-btn">
          {loadingRequests ? '⏳ Laden...' : '🔄 Vernieuwen'}
        </button>

        {requests.length > 0 ? (
          <div className="requests-list">
            {requests.map((req, idx) => (
              <div key={req.id} className="request-item">
                <span className="order">{idx + 1}.</span>
                <div className="request-info">
                  <p className="request-track">{req.track_name}</p>
                  <p className="request-artist">van {req.artist_name}</p>
                  <p className="request-artist">aangevraagd door {req.guest_name || 'Onbekend'}</p>
                </div>
                <span className={req.added_to_playlist ? '✅' : '⏳'}>
                  {req.added_to_playlist ? 'Toegevoegd' : 'In wachtrij'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-requests">Nog geen nummers aangevraagd</p>
        )}
      </div>
    </div>
  );
}
