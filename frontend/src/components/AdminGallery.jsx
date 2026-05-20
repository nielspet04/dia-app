import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE, MEDIA_BASE } from '../config';

export default function AdminGallery({ adminPassword }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
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

  useEffect(() => {
    Promise.resolve().then(fetchUploads);
    const interval = setInterval(fetchUploads, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchUploads]);

  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
    return 'file';
  };

  const filteredUploads = uploads.filter(upload => {
    if (filter === 'images') return getFileType(upload.filename) === 'image';
    if (filter === 'videos') return getFileType(upload.filename) === 'video';
    return true;
  });

  const handleDelete = async (upload) => {
    const confirmed = window.confirm(`Foto van ${upload.guest_name || 'onbekend'} verwijderen?`);
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

  return (
    <div className="admin-gallery">
      <h2>📸 Galerij - Alle uploads</h2>
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
          Video's ({uploads.filter(u => getFileType(u.filename) === 'video').length})
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>
          ⏳ Laden...
        </p>
      ) : filteredUploads.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0', fontStyle: 'italic' }}>
          Nog geen uploads...
        </p>
      ) : (
        <div className="gallery-grid">
          {filteredUploads.map((upload) => {
            const isImage = getFileType(upload.filename) === 'image';
            const isVideo = getFileType(upload.filename) === 'video';
            
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
