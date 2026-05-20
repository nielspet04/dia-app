import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { getUploadSessionId, saveGuestName } from '../uploadSession';

const MAX_UPLOADS = 5;

export default function UploadMedia({ guestName }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [sessionId] = useState(getUploadSessionId);
  const [remainingUploads, setRemainingUploads] = useState(MAX_UPLOADS);

  useEffect(() => {
    const loadUploadCount = async () => {
      try {
        const response = await axios.get(`${API_BASE}/uploads/count`, {
          params: { sessionId }
        });
        setRemainingUploads(response.data.remaining);
      } catch (error) {
        console.error('Failed to load upload count:', error);
      }
    };

    loadUploadCount();
  }, [sessionId]);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const cleanGuestName = guestName.trim();

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je foto\'s selecteert.');
      setMessage('⚠️ Vul eerst je naam in');
      e.target.value = '';
      return;
    }
    
    if (remainingUploads <= 0) {
      setMessage('⚠️ Je hebt al 5 foto\'s geupload');
      e.target.value = '';
      return;
    }

    if (selectedFiles.length > remainingUploads) {
      setMessage(`⚠️ Je kunt nog maar ${remainingUploads} foto${remainingUploads === 1 ? '' : '\'s'} uploaden`);
      e.target.value = '';
      return;
    }

    // Check file types - only images
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    const invalidFiles = selectedFiles.filter(f => !validTypes.includes(f.type));

    if (invalidFiles.length > 0) {
      setMessage('❌ Alleen foto\'s (JPG, PNG, GIF) toegestaan');
      e.target.value = '';
      return;
    }

    setFiles(selectedFiles);
    setMessage('');
  };

  const handleUpload = async () => {
    const cleanGuestName = guestName.trim().replace(/\s+/g, ' ');

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je uploadt.');
      setMessage('⚠️ Vul eerst je naam in');
      return;
    }

    if (files.length === 0) {
      setMessage('⚠️ Selecteer eerst bestanden');
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

      setMessage(`✅ ${response.data.message}`);
      setRemainingUploads(response.data.remaining);
      setFiles([]);
      setProgress(0);

      // Reset after 3 seconds
      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      setMessage(`❌ Upload mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-media">
      <div className="upload-box">
        <h3>📸 Upload je foto's</h3>
        <p className="upload-hint">Nog {remainingUploads} van {MAX_UPLOADS} foto's beschikbaar</p>

        <input
          type="file"
          id="file-input"
          multiple
          accept="image/jpeg,image/png,image/gif"
          onChange={handleFileSelect}
          disabled={uploading || remainingUploads <= 0 || !guestName.trim()}
          style={{ display: 'none' }}
        />

        <label
          htmlFor="file-input"
          className="file-label"
          onClick={(e) => {
            if (!guestName.trim()) {
              e.preventDefault();
              alert('Vul eerst je naam in voordat je foto\'s selecteert.');
              setMessage('⚠️ Vul eerst je naam in');
            }
          }}
        >
          📁 Selecteer bestanden
        </label>

        {files.length > 0 && (
          <div className="file-list">
            <h4>Geselecteerde bestanden:</h4>
            <ul>
              {Array.from(files).map((file, idx) => (
                <li key={idx}>
                  {file.type.startsWith('image') ? '🖼️' : '🎬'} {file.name}
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
          {uploading ? `⏳ Uploading... ${progress}%` : '🚀 Upload'}
        </button>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}
