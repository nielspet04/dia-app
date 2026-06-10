import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE, MEDIA_BASE } from '../config';

export default function AdminGallery({ adminPassword }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [exportingPhotos, setExportingPhotos] = useState(false);
  const [message, setMessage] = useState('');

  const fetchUploads = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/uploads`);
      setUploads(response.data || []);
    } catch (error) {
      console.error('Failed to fetch uploads:', error);
      setMessage(`Foto's laden mislukt: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchUploads);
    const interval = setInterval(fetchUploads, 5000);
    return () => clearInterval(interval);
  }, [fetchUploads]);

  const photoUploads = useMemo(() => uploads.filter((upload) => {
    if (upload.guest_removed) return false;

    const uploadType = upload.media_type || '';
    const ext = upload.filename?.split('.').pop()?.toLowerCase();
    return uploadType === 'photo' || ['jpg', 'jpeg', 'png', 'gif'].includes(ext);
  }), [uploads]);

  const handleDelete = async (upload) => {
    const confirmed = window.confirm(`Foto van ${upload.guest_name || 'onbekend'} verwijderen?`);
    if (!confirmed) return;

    setDeletingId(upload.id);
    setMessage('');

    try {
      await axios.post(`${API_BASE}/uploads/${upload.id}/hide`, {
        adminPassword
      }, {
        headers: { 'x-admin-password': adminPassword }
      });
      setUploads((currentUploads) => currentUploads.filter((item) => item.id !== upload.id));
      setMessage('Foto verwijderd. De slideshow is bijgewerkt.');
    } catch (error) {
      setMessage(`Verwijderen mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Failed to delete upload:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportPhotos = async () => {
    setExportingPhotos(true);
    setMessage('');

    try {
      const response = await axios.get(`${API_BASE}/uploads/photos.zip`, {
        headers: { 'x-admin-password': adminPassword },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'dia-arcadia-fotos.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('Foto ZIP download gestart.');
    } catch (error) {
      setMessage(`Foto ZIP mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Failed to export photos:', error);
    } finally {
      setExportingPhotos(false);
    }
  };

  return (
    <div className="admin-gallery">
      <div className="gallery-header-row">
        <div>
          <h2>Foto beheer</h2>
          <p className="gallery-subtitle">
            {photoUploads.length} foto{photoUploads.length === 1 ? '' : "'s"} klaar voor de slideshow.
          </p>
        </div>
        <button
          type="button"
          className="export-zip-btn"
          onClick={handleExportPhotos}
          disabled={exportingPhotos || photoUploads.length === 0}
        >
          {exportingPhotos ? 'ZIP maken...' : `Download ZIP (${photoUploads.length})`}
        </button>
      </div>

      {message && <p className="gallery-message">{message}</p>}

      {loading ? (
        <p className="admin-empty-state">Foto's laden...</p>
      ) : photoUploads.length === 0 ? (
        <p className="admin-empty-state">Er zijn nog geen foto's geüpload.</p>
      ) : (
        <div className="gallery-grid">
          {photoUploads.map((upload) => (
            <article key={upload.id} className="gallery-item">
              <a
                href={`${MEDIA_BASE}${upload.filepath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="gallery-link"
                aria-label="Foto openen"
              >
                <div className="gallery-media">
                  <img
                    src={`${MEDIA_BASE}${upload.filepath}`}
                    alt={upload.originalname || 'Upload'}
                    loading="lazy"
                  />
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
                  {deletingId === upload.id ? 'Verwijderen...' : 'Verwijder uit slideshow'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
