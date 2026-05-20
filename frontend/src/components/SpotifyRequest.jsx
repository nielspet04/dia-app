import { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

export default function SpotifyRequest() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      // Placeholder - we'll implement real Spotify search later
      // For now, just show a mock result
      setResults([
        {
          id: '1',
          name: searchQuery,
          artist: 'Artist Name',
          uri: 'spotify:track:...'
        }
      ]);
      setMessage('');
    } catch {
      setMessage('❌ Zoeken mislukt');
    } finally {
      setSearching(false);
    }
  };

  const handleAddRequest = async (track) => {
    try {
      await axios.post(`${API_BASE}/spotify/request`, {
        trackId: track.id,
        trackName: track.name,
        artistName: track.artist
      });

      setMessage(`✅ "${track.name}" toegevoegd aan playlist!`);
      setSearchQuery('');
      setResults([]);

      setTimeout(() => {
        setMessage('');
      }, 2000);
    } catch (error) {
      setMessage('❌ Kon nummer niet toevoegen');
      console.error('Request error:', error);
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

        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Zoek een nummernaam of artiest..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={searching}
          />
          <button type="submit" disabled={searching}>
            {searching ? '🔍 Zoeken...' : '🔍 Zoeken'}
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        {results.length > 0 && (
          <div className="results">
            <h4>Zoekresultaten:</h4>
            {results.map((track) => (
              <div key={track.id} className="track-item">
                <div className="track-info">
                  <p className="track-name">{track.name}</p>
                  <p className="track-artist">{track.artist}</p>
                </div>
                <button
                  onClick={() => handleAddRequest(track)}
                  className="add-btn"
                >
                  ➕ Toevoegen
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
                </div>
                <span className={req.added_to_playlist ? '✅' : '⏳'}>
                  {req.added_to_playlist ? 'Afgespeeld' : 'In wachtrij'}
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
