import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import {
  getSavedGuestName,
  getUploadSessionId,
  MAX_GUEST_NAME_LENGTH,
  saveGuestName
} from '../uploadSession';

const MAX_VIDEO_UPLOADS = 1;

export default function UploadVideo() {
  const [video, setVideo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [sessionId] = useState(getUploadSessionId);
  const [remainingUploads, setRemainingUploads] = useState(MAX_VIDEO_UPLOADS);
  const [guestName, setGuestName] = useState(getSavedGuestName);

  useEffect(() => {
    const loadUploadCount = async () => {
      try {
        const response = await axios.get(`${API_BASE}/uploads/count`, {
          params: { sessionId, type: 'video' }
        });
        setRemainingUploads(response.data.remaining);
      } catch (error) {
        console.error('Failed to load video upload count:', error);
      }
    };

    loadUploadCount();
  }, [sessionId]);

  const handleVideoSelect = (e) => {
    const selectedVideo = e.target.files?.[0];
    const cleanGuestName = guestName.trim();

    if (!cleanGuestName) {
      setMessage('⚠️ Vul eerst je naam in');
      e.target.value = '';
      return;
    }

    if (remainingUploads <= 0) {
      setMessage('⚠️ Je hebt al 1 video geupload');
      e.target.value = '';
      return;
    }

    if (!selectedVideo) return;

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!validTypes.includes(selectedVideo.type)) {
      setMessage('❌ Alleen video\'s (MP4, MOV, WebM) toegestaan');
      e.target.value = '';
      return;
    }

    setVideo(selectedVideo);
    setMessage('');
  };

  const handleUpload = async () => {
    const cleanGuestName = guestName.trim().replace(/\s+/g, ' ');

    if (!cleanGuestName) {
      setMessage('⚠️ Vul eerst je naam in');
      return;
    }

    if (!video) {
      setMessage('⚠️ Selecteer eerst een video');
      return;
    }

    saveGuestName(cleanGuestName);
    setUploading(true);
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('guestName', cleanGuestName);
    formData.append('video', video);

    try {
      const response = await axios.post(`${API_BASE}/video-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      setMessage(`✅ ${response.data.message}`);
      setRemainingUploads(response.data.remaining);
      setVideo(null);
      setProgress(0);

      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      setMessage(`❌ Upload mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Video upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-media">
      <div className="upload-box">
        <h3>🎬 Upload je video</h3>
        <p className="upload-hint">Nog {remainingUploads} van {MAX_VIDEO_UPLOADS} video beschikbaar</p>

        <label className="guest-name-label" htmlFor="video-guest-name">
          Jouw naam
        </label>
        <input
          id="video-guest-name"
          className="guest-name-input"
          type="text"
          value={guestName}
          maxLength={MAX_GUEST_NAME_LENGTH}
          onChange={(e) => {
            setGuestName(e.target.value);
            saveGuestName(e.target.value);
          }}
          placeholder="Bijvoorbeeld: Niels"
          disabled={uploading || remainingUploads <= 0}
          required
        />

        <input
          type="file"
          id="video-input"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={handleVideoSelect}
          disabled={uploading || remainingUploads <= 0 || !guestName.trim()}
          style={{ display: 'none' }}
        />

        <label htmlFor="video-input" className="file-label">
          🎬 Selecteer video
        </label>

        {video && (
          <div className="file-list">
            <h4>Geselecteerde video:</h4>
            <ul>
              <li>🎬 {video.name}</li>
            </ul>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !video || remainingUploads <= 0 || !guestName.trim()}
          className="upload-btn"
        >
          {uploading ? `⏳ Uploading... ${progress}%` : '🚀 Upload video'}
        </button>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}
