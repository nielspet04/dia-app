import { useCallback, useEffect, useState } from 'react';
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
  const [currentRequest, setCurrentRequest] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const response = await axios.get(`${API_BASE}/spotify/requests`);
      setRequests(response.data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadRequestState = useCallback(async () => {
    try {
      const [countResponse, currentResponse] = await Promise.all([
        axios.get(`${API_BASE}/spotify/count`, {
          params: { sessionId }
        }),
        axios.get(`${API_BASE}/spotify/current`, {
          params: { sessionId }
        })
      ]);
      setRemainingRequests(countResponse.data.remaining);
      setCurrentRequest(currentResponse.data || null);
    } catch (error) {
      console.error('Failed to load Spotify request state:', error);
    }
  }, [sessionId]);

  useEffect(() => {
    let isMounted = true;

    const loadInitialRequestState = async () => {
      try {
        const [countResponse, currentResponse] = await Promise.all([
          axios.get(`${API_BASE}/spotify/count`, {
            params: { sessionId }
          }),
          axios.get(`${API_BASE}/spotify/current`, {
            params: { sessionId }
          })
        ]);

        if (isMounted) {
          setRemainingRequests(countResponse.data.remaining);
          setCurrentRequest(currentResponse.data || null);
        }
      } catch (error) {
        console.error('Failed to load Spotify request state:', error);
      }
    };

    loadInitialRequestState();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  useEffect(() => {
    let isMounted = true;

    const loadInitialRequests = async () => {
      try {
        const response = await axios.get(`${API_BASE}/spotify/requests`);
        if (isMounted) {
          setRequests(response.data);
        }
      } catch (error) {
        console.error('Failed to load requests:', error);
      }
    };

    loadInitialRequests();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    const cleanGuestName = guestName.trim();
    const canRequestSong = remainingRequests > 0 || Boolean(currentRequest);

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je een nummer zoekt.');
      setMessage('Vul eerst je naam in');
      return;
    }

    if (!canRequestSong) {
      setMessage('Je hebt al 1 nummer aangevraagd');
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
      setMessage(`Zoeken mislukt: ${error.response?.data?.error || error.message}`);
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

      setMessage(`"${track.name}" ${currentRequest ? 'gewijzigd' : 'toegevoegd'} in playlist!`);
      setRemainingRequests(0);
      setCurrentRequest({
        track_id: track.id,
        track_name: track.name,
        artist_name: track.artist,
        track_uri: track.uri,
        guest_name: cleanGuestName,
        added_to_playlist: 1
      });
      setSearchQuery('');
      setResults([]);
      loadRequests();
      loadRequestState();

      setTimeout(() => {
        setMessage('');
      }, 2000);
    } catch (error) {
      setMessage(`Kon nummer niet toevoegen: ${error.response?.data?.error || error.message}`);
      console.error('Request error:', error);
    } finally {
      setAddingTrackId('');
    }
  };

  const canRequestSong = remainingRequests > 0 || Boolean(currentRequest);

  return (
    <div className="spotify-request">
      <div className="search-box">
        <h3>Request een nummer</h3>
        {currentRequest ? (
          <div className="current-song">
            <p className="current-song-label">Jouw huidige keuze</p>
            <p className="current-song-title">{currentRequest.track_name}</p>
            <p className="current-song-artist">van {currentRequest.artist_name}</p>
            <p className="upload-hint">Toch een beter nummer bedacht? Zoek hieronder en wijzig je keuze.</p>
          </div>
        ) : (
          <p className="upload-hint">Nog {remainingRequests} van 1 nummer beschikbaar</p>
        )}

        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Zoek een nummernaam of artiest..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={searching || !canRequestSong}
          />
          <button type="submit" disabled={searching || !canRequestSong}>
            {searching ? 'Zoeken...' : 'Zoeken'}
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
                  disabled={addingTrackId === track.id || !canRequestSong}
                >
                  {addingTrackId === track.id
                    ? (currentRequest ? 'Wijzigen...' : 'Toevoegen...')
                    : (currentRequest ? 'Wijzig naar dit nummer' : 'Toevoegen')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="requests-box">
        <h3>Aangevraagde nummers</h3>
        <button onClick={loadRequests} className="refresh-btn">
          {loadingRequests ? 'Laden...' : 'Vernieuwen'}
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
                <span className="request-status">
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
