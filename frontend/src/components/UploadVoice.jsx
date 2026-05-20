import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { getUploadSessionId, saveGuestName } from '../uploadSession';

const MAX_AUDIO_UPLOADS = 1;

const getSupportedAudioType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const getAudioExtension = (mimeType) => {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
};

export default function UploadVoice({ guestName }) {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [sessionId] = useState(getUploadSessionId);
  const [remainingUploads, setRemainingUploads] = useState(MAX_AUDIO_UPLOADS);

  useEffect(() => {
    const loadUploadCount = async () => {
      try {
        const response = await axios.get(`${API_BASE}/uploads/count`, {
          params: { sessionId, type: 'audio' }
        });
        setRemainingUploads(response.data.remaining);
      } catch (error) {
        console.error('Failed to load audio upload count:', error);
      }
    };

    loadUploadCount();
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  const startRecording = async () => {
    const cleanGuestName = guestName.trim();

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je een spraakbericht opneemt.');
      setMessage('⚠️ Vul eerst je naam in');
      return;
    }

    if (remainingUploads <= 0) {
      setMessage('⚠️ Je hebt al 1 spraakbericht geupload');
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setMessage('❌ Opnemen wordt niet ondersteund door deze browser');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
      setMessage('');
    } catch (error) {
      setMessage('❌ Microfoon openen mislukt');
      console.error('Recording error:', error);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setProgress(0);
    setMessage('');
  };

  const handleUpload = async () => {
    const cleanGuestName = guestName.trim().replace(/\s+/g, ' ');

    if (!cleanGuestName) {
      alert('Vul eerst je naam in voordat je uploadt.');
      setMessage('⚠️ Vul eerst je naam in');
      return;
    }

    if (!audioBlob) {
      setMessage('⚠️ Spreek eerst een bericht in');
      return;
    }

    saveGuestName(cleanGuestName);
    setUploading(true);

    const extension = getAudioExtension(audioBlob.type);
    const audioFile = new File([audioBlob], `spraakbericht-${Date.now()}.${extension}`, {
      type: audioBlob.type || 'audio/webm'
    });
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('guestName', cleanGuestName);
    formData.append('audio', audioFile);

    try {
      const response = await axios.post(`${API_BASE}/audio-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      setMessage(`✅ ${response.data.message}`);
      setRemainingUploads(response.data.remaining);
      resetRecording();
    } catch (error) {
      setMessage(`❌ Upload mislukt: ${error.response?.data?.error || error.message}`);
      console.error('Audio upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-media">
      <div className="upload-box">
        <h3>🎙️ Spreek een bericht in</h3>
        <p className="upload-hint">Nog {remainingUploads} van {MAX_AUDIO_UPLOADS} spraakbericht beschikbaar</p>

        <div className="record-controls">
          {!recording ? (
            <button
              type="button"
              className="record-btn"
              onClick={startRecording}
              disabled={uploading || remainingUploads <= 0}
            >
              🎙️ Start opname
            </button>
          ) : (
            <button type="button" className="record-btn recording" onClick={stopRecording}>
              ⏹️ Stop opname
            </button>
          )}
        </div>

        {audioUrl && (
          <div className="voice-preview">
            <audio src={audioUrl} controls />
            <button type="button" className="secondary-btn" onClick={resetRecording} disabled={uploading}>
              Opnieuw opnemen
            </button>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !audioBlob || remainingUploads <= 0 || !guestName.trim()}
          className="upload-btn"
        >
          {uploading ? `⏳ Uploading... ${progress}%` : '🚀 Upload spraakbericht'}
        </button>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}
