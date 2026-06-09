import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, MEDIA_BASE } from '../config';
import { getUploadSessionId, saveGuestName } from '../uploadSession';

const MAX_UPLOADS = 5;

export default function UploadMedia({ guestName }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [sessionId] = useState(getUploadSessionId);
  const [remainingUploads, setRemainingUploads] = useState(MAX_UPLOADS);
  const [uploadedPhotos, setUploadedPhotos] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const loadPhotoState = async () => {
      const countRequest = axios.get(`${API_BASE}/uploads/count`, {
        params: { sessionId }
      });
      const photosRequest = axios.get(`${API_BASE}/uploads/mine`, {
        params: { sessionId }
      });

      const [countResult, photosResult] = await Promise.allSettled([countRequest, photosRequest]);

      if (!isMounted) return;

      if (countResult.status === 'fulfilled') {
        setRemainingUploads(countResult.value.data.remaining);
      } else {
        console.error('Failed to load upload count:', countResult.reason);
      }

      if (photosResult.status === 'fulfilled') {
        setUploadedPhotos(photosResult.value.data || []);
      } else {
        console.error('Failed to load own photos:', photosResult.reason);
      }
    };

    loadPhotoState();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const getFileKey = (file) => `${file.name}-${file.size}-${file.lastModified}`;

  const refreshPhotoState = async () => {
    const countRequest = axios.get(`${API_BASE}/uploads/count`, {
      params: { sessionId }
    });
    const photosRequest = axios.get(`${API_BASE}/uploads/mine`, {
      params: { sessionId }
    });

    const [countResult, photosResult] = await Promise.allSettled([countRequest, photosRequest]);

    if (countResult.status === 'fulfilled') {
      setRemainingUploads(countResult.value.data.remaining);
    } else {
      console.error('Failed to refresh upload count:', countResult.reason);
    }

    if (photosResult.status === 'fulfilled') {
      setUploadedPhotos(photosResult.value.data || []);
    } else {
      console.error('Failed to refresh own photos:', photosResult.reason);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const cleanGuestName = guestName.trim();

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je foto\'s selecteert.');
      setMessage('Vul eerst je naam in.');
      e.target.value = '';
      return;
    }
    
    if (remainingUploads <= 0) {
      setMessage('Je hebt het maximum van 5 foto\'s bereikt.');
      e.target.value = '';
      return;
    }

    // Check file types - only images
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    const invalidFiles = selectedFiles.filter(f => !validTypes.includes(f.type));

    if (invalidFiles.length > 0) {
      setMessage('Alleen foto\'s in JPG, PNG of GIF zijn toegestaan.');
      e.target.value = '';
      return;
    }

    const existingFileKeys = new Set(files.map(getFileKey));
    const uniqueNewFiles = selectedFiles.filter(file => !existingFileKeys.has(getFileKey(file)));
    const allowedNewFileCount = remainingUploads - files.length;

    if (allowedNewFileCount <= 0) {
      setMessage(`Je hebt al ${files.length} foto${files.length === 1 ? '' : '\'s'} geselecteerd.`);
      e.target.value = '';
      return;
    }

    if (uniqueNewFiles.length > allowedNewFileCount) {
      setMessage(`Je kunt nog ${allowedNewFileCount} extra foto${allowedNewFileCount === 1 ? '' : '\'s'} selecteren.`);
      e.target.value = '';
      return;
    }

    setFiles((currentFiles) => [...currentFiles, ...uniqueNewFiles]);
    setMessage('');
    e.target.value = '';
  };

  const handleUpload = async () => {
    const cleanGuestName = guestName.trim().replace(/\s+/g, ' ');

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je uploadt.');
      setMessage('Vul eerst je naam in.');
      return;
    }

    if (files.length === 0) {
      setMessage('Selecteer eerst een foto.');
      return;
    }

    saveGuestName(cleanGuestName);
    setUploading(true);
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('guestName', cleanGuestName);
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      setMessage(response.data.message);
      setRemainingUploads(response.data.remaining);
      if (response.data.photos) {
        setUploadedPhotos(response.data.photos);
      }
      setFiles([]);
      setProgress(0);
      refreshPhotoState();

      // Reset after 3 seconds
      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      setMessage(`Upload mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-media">
      <div className="upload-box">
        <h2>Foto uploaden</h2>
        <p className="upload-hint">Nog {remainingUploads} van {MAX_UPLOADS} foto's beschikbaar.</p>

        <input
          type="file"
          id="file-input"
          multiple
          accept="image/jpeg,image/png,image/gif"
          onChange={handleFileSelect}
          disabled={uploading || remainingUploads <= 0 || !guestName.trim()}
          style={{ display: 'none' }}
        />

        <input
          type="file"
          id="camera-input"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          disabled={uploading || remainingUploads <= 0 || !guestName.trim()}
          style={{ display: 'none' }}
        />

        <div className="file-actions">
          <label
            htmlFor="camera-input"
            className="file-label"
            disabled={uploading || remainingUploads <= 0 || !guestName.trim()}
            onClick={(e) => {
              if (!guestName.trim()) {
                e.preventDefault();
                alert('Vul eerst je naam in voordat je een foto maakt.');
                setMessage('Vul eerst je naam in.');
              }
            }}
          >
            Foto maken
          </label>

          <label
            htmlFor="file-input"
            className="file-label"
            disabled={uploading || remainingUploads <= 0 || !guestName.trim()}
            onClick={(e) => {
              if (!guestName.trim()) {
                e.preventDefault();
                alert('Vul eerst je naam in voordat je foto\'s selecteert.');
                setMessage('Vul eerst je naam in.');
              }
            }}
          >
            Foto kiezen
          </label>
        </div>

        {files.length > 0 && (
          <div className="file-list">
            <h3>Geselecteerd</h3>
            <ul>
              {Array.from(files).map((file, idx) => (
                <li key={idx}>
                  {file.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || remainingUploads <= 0 || !guestName.trim()}
          className="upload-btn"
        >
          {uploading ? `Bezig met uploaden... ${progress}%` : 'Foto verzenden'}
        </button>

        {message && <p className="message">{message}</p>}
      </div>

      <div className="upload-box own-photos-box">
        <h2>Toegevoegde foto's</h2>
        <p className="upload-hint">
          Hier zie je de foto's die je vanaf dit toestel hebt toegevoegd.
        </p>

        {uploadedPhotos.length > 0 ? (
          <div className="own-photo-grid">
            {uploadedPhotos.map((photo) => (
              <div key={photo.id} className="own-photo-item">
                <img
                  src={`${MEDIA_BASE}${photo.filepath}`}
                  alt={photo.originalname || 'Geüploade foto'}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="own-photo-empty">Je hebt nog geen foto's geüpload.</p>
        )}
      </div>
    </div>
  );
}
