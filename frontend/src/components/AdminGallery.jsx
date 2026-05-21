import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE, MEDIA_BASE } from '../config';

export default function AdminGallery({ adminPassword }) {
  const [uploads, setUploads] = useState([]);
  const [songRequests, setSongRequests] = useState([]);
  const [textMessages, setTextMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [filter, setFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const [deletingSongId, setDeletingSongId] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [message, setMessage] = useState('');

  const fetchUploads = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/uploads`);
      setUploads(response.data || []);
    } catch (error) {
      console.error('Failed to fetch uploads:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSongRequests = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/spotify/requests`);
      setSongRequests(response.data || []);
    } catch (error) {
      console.error('Failed to fetch Spotify requests:', error);
    } finally {
      setLoadingSongs(false);
    }
  }, []);

  const fetchTextMessages = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/messages`);
      setTextMessages(response.data || []);
    } catch (error) {
      console.error('Failed to fetch text messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchUploads();
      fetchSongRequests();
      fetchTextMessages();
    });

    const interval = setInterval(() => {
      fetchUploads();
      fetchSongRequests();
      fetchTextMessages();
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchSongRequests, fetchTextMessages, fetchUploads]);

  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
    if (['m4a', 'mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
    return 'file';
  };

  const getUploadType = (upload) => upload.media_type || getFileType(upload.filename);

  const filteredUploads = uploads.filter(upload => {
    const uploadType = getUploadType(upload);
    if (filter === 'images') return uploadType === 'photo' || uploadType === 'image';
    if (filter === 'videos') return uploadType === 'video';
    if (filter === 'audio') return uploadType === 'audio';
    return true;
  });

  const handleDelete = async (upload) => {
    const confirmed = window.confirm(`Upload van ${upload.guest_name || 'onbekend'} verwijderen?`);
    if (!confirmed) return;

    setDeletingId(upload.id);
    setMessage('');

    try {
      await axios.delete(`${API_BASE}/uploads/${upload.id}`, {
        headers: { 'x-admin-password': adminPassword }
      });
      setUploads((currentUploads) => currentUploads.filter((item) => item.id !== upload.id));
      setMessage('Foto verwijderd');
    } catch (error) {
      setMessage(`Verwijderen mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Failed to delete upload:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSong = async (songRequest) => {
    const confirmed = window.confirm(`"${songRequest.track_name}" uit de playlist verwijderen?`);
    if (!confirmed) return;

    setDeletingSongId(songRequest.id);
    setMessage('');

    try {
      await axios.delete(`${API_BASE}/spotify/requests/${songRequest.id}`, {
        headers: { 'x-admin-password': adminPassword }
      });
      setSongRequests((currentRequests) => currentRequests.filter((item) => item.id !== songRequest.id));
      setMessage('Nummer verwijderd uit playlist');
    } catch (error) {
      setMessage(`Nummer verwijderen mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Failed to delete Spotify request:', error);
    } finally {
      setDeletingSongId(null);
    }
  };

  const handleDeleteMessage = async (textMessage) => {
    const confirmed = window.confirm(`Boodschap van ${textMessage.guest_name || 'onbekend'} verwijderen?`);
    if (!confirmed) return;

    setDeletingMessageId(textMessage.id);
    setMessage('');

    try {
      await axios.delete(`${API_BASE}/messages/${textMessage.id}`, {
        headers: { 'x-admin-password': adminPassword }
      });
      setTextMessages((currentMessages) => currentMessages.filter((item) => item.id !== textMessage.id));
      setMessage('Boodschap verwijderd');
    } catch (error) {
      setMessage(`Boodschap verwijderen mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Failed to delete text message:', error);
    } finally {
      setDeletingMessageId(null);
    }
  };

  return (
    <div className="admin-gallery">
      <section className="admin-song-panel">
        <h2>Tekstboodschappen</h2>
        <p className="gallery-subtitle">{textMessages.length} boodschappen</p>

        {loadingMessages ? (
          <p className="admin-empty-state">Laden...</p>
        ) : textMessages.length === 0 ? (
          <p className="admin-empty-state">Nog geen tekstboodschappen...</p>
        ) : (
          <div className="admin-message-list">
            {textMessages.map((textMessage) => (
              <article key={textMessage.id} className="admin-message-card">
                <p className="admin-message-text">{textMessage.message}</p>
                <div className="admin-message-meta">
                  <span>Door {textMessage.guest_name || 'Onbekend'}</span>
                  <span>
                    {new Date(textMessage.updated_at).toLocaleDateString('nl-NL', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  className="delete-upload-btn admin-message-delete"
                  onClick={() => handleDeleteMessage(textMessage)}
                  disabled={deletingMessageId === textMessage.id}
                >
                  {deletingMessageId === textMessage.id ? 'Verwijderen...' : 'Verwijderen'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-song-panel">
        <h2>Aangevraagde nummers</h2>
        <p className="gallery-subtitle">{songRequests.length} nummers</p>

        {loadingSongs ? (
          <p className="admin-empty-state">Laden...</p>
        ) : songRequests.length === 0 ? (
          <p className="admin-empty-state">Nog geen nummers aangevraagd...</p>
        ) : (
          <div className="admin-song-list">
            {songRequests.map((songRequest, idx) => (
              <div key={songRequest.id} className="admin-song-item">
                <span className="order">{idx + 1}.</span>
                <div className="request-info">
                  <p className="request-track">{songRequest.track_name}</p>
                  <p className="request-artist">van {songRequest.artist_name}</p>
                  <p className="request-artist">aangevraagd door {songRequest.guest_name || 'Onbekend'}</p>
                </div>
                <button
                  type="button"
                  className="delete-upload-btn admin-song-delete"
                  onClick={() => handleDeleteSong(songRequest)}
                  disabled={deletingSongId === songRequest.id}
                >
                  {deletingSongId === songRequest.id ? 'Verwijderen...' : 'Verwijderen'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <h2>Galerij - Alle uploads</h2>
      <p className="gallery-subtitle">{filteredUploads.length} bestanden</p>
      {message && <p className="gallery-message">{message}</p>}

      <div className="gallery-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Alles ({uploads.length})
        </button>
        <button 
          className={`filter-btn ${filter === 'images' ? 'active' : ''}`}
          onClick={() => setFilter('images')}
        >
          Foto's ({uploads.filter(u => getFileType(u.filename) === 'image').length})
        </button>
        <button 
          className={`filter-btn ${filter === 'videos' ? 'active' : ''}`}
          onClick={() => setFilter('videos')}
        >
          Video's ({uploads.filter(u => getUploadType(u) === 'video').length})
        </button>
        <button
          className={`filter-btn ${filter === 'audio' ? 'active' : ''}`}
          onClick={() => setFilter('audio')}
        >
          Spraak ({uploads.filter(u => getUploadType(u) === 'audio').length})
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>
          Laden...
        </p>
      ) : filteredUploads.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0', fontStyle: 'italic' }}>
          Nog geen uploads...
        </p>
      ) : (
        <div className="gallery-grid">
          {filteredUploads.map((upload) => {
            const uploadType = getUploadType(upload);
            const isImage = uploadType === 'photo' || uploadType === 'image';
            const isVideo = uploadType === 'video';
            const isAudio = uploadType === 'audio';
            
            return (
              <div key={upload.id} className="gallery-item">
                <a 
                  href={`${MEDIA_BASE}${upload.filepath}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="gallery-link"
                >
                  <div className="gallery-media">
                    {isImage && (
                      <img 
                        src={`${MEDIA_BASE}${upload.filepath}`} 
                        alt="Upload"
                        loading="lazy"
                      />
                    )}
                    {isVideo && (
                      <video
                        src={`${MEDIA_BASE}${upload.filepath}`}
                        controls
                        preload="metadata"
                      />
                    )}
                    {isAudio && (
                      <div className="audio-preview">
                        <span>Spraakbericht</span>
                        <audio
                          src={`${MEDIA_BASE}${upload.filepath}`}
                          controls
                          preload="metadata"
                        />
                      </div>
                    )}
                  </div>
                </a>
                <div className="gallery-info">
                  <p className="gallery-filename">{upload.originalname || upload.filename}</p>
                  <p className="gallery-guest">Door {upload.guest_name || 'Onbekend'}</p>
                  <p className="gallery-date">
                    {new Date(upload.uploaded_at).toLocaleDateString('nl-NL', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                  <button
                    type="button"
                    className="delete-upload-btn"
                    onClick={() => handleDelete(upload)}
                    disabled={deletingId === upload.id}
                  >
                    {deletingId === upload.id ? 'Verwijderen...' : 'Verwijderen'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
