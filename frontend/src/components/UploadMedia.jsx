import { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

export default function UploadMedia() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    
    // Limit to 5 files (photos only, no videos)
    if (selectedFiles.length > 5) {
      setMessage('⚠️ Maximum 5 foto\'s toegestaan');
      return;
    }

    // Check file types - only images
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    const invalidFiles = selectedFiles.filter(f => !validTypes.includes(f.type));

    if (invalidFiles.length > 0) {
      setMessage('❌ Alleen foto\'s (JPG, PNG, GIF) toegestaan');
      return;
    }

    setFiles(selectedFiles);
    setMessage('');
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage('⚠️ Selecteer eerst bestanden');
      return;
    }

    setUploading(true);
    const formData = new FormData();
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
        <p className="upload-hint">Maximum 5 foto's</p>

        <input
          type="file"
          id="file-input"
          multiple
          accept="image/jpeg,image/png,image/gif"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />

        <label htmlFor="file-input" className="file-label">
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
          disabled={uploading || files.length === 0}
          className="upload-btn"
        >
          {uploading ? `⏳ Uploading... ${progress}%` : '🚀 Upload'}
        </button>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}
