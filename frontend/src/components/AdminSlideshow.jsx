import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE, MEDIA_BASE } from '../config';

const SLIDE_DURATION_MS = 8000;

export default function AdminSlideshow({ onExit, onLogout }) {
  const [uploads, setUploads] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchUploads = async () => {
      try {
        const response = await axios.get(`${API_BASE}/uploads`);
        if (isMounted) setUploads(response.data || []);
      } catch (error) {
        console.error('Failed to load slideshow uploads:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUploads();
    const refreshInterval = setInterval(fetchUploads, 12000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  const slides = useMemo(() => uploads.filter((upload) => {
    if (upload.guest_removed) return false;

    const uploadType = upload.media_type || '';
    const ext = upload.filename?.split('.').pop()?.toLowerCase();
    return uploadType === 'photo' || ['jpg', 'jpeg', 'png', 'gif'].includes(ext);
  }), [uploads]);

  const safeCurrentIndex = slides.length ? currentIndex % slides.length : 0;
  const currentSlide = slides[safeCurrentIndex];

  useEffect(() => {
    if (slides.length <= 1) return undefined;

    const slideInterval = setInterval(() => {
      setCurrentIndex((index) => (index + 1) % slides.length);
    }, SLIDE_DURATION_MS);

    return () => clearInterval(slideInterval);
  }, [slides.length]);

  const showPrevious = () => {
    if (slides.length === 0) return;
    setCurrentIndex((index) => (index - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    if (slides.length === 0) return;
    setCurrentIndex((index) => (index + 1) % slides.length);
  };

  const openFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch((error) => {
      console.error('Fullscreen failed:', error);
    });
  };

  return (
    <div className="slideshow-page">
      <header className="slideshow-topbar">
        <div className="slideshow-brand">
          <img
            src="/dia-arcadia-logo.png"
            alt="DIA Arcadia Damiaaninstituut Aarschot"
          />
          <div>
            <p className="hero-kicker">Damiaaninstituut Aarschot</p>
            <h1>DIA Arcadia</h1>
          </div>
        </div>
        <div className="slideshow-actions">
          <button type="button" onClick={showPrevious}>Vorige</button>
          <button type="button" onClick={showNext}>Volgende</button>
          <button type="button" onClick={openFullscreen}>Fullscreen</button>
          <button type="button" onClick={onExit}>Beheer</button>
          <button type="button" onClick={onLogout}>Uitloggen</button>
        </div>
      </header>

      <main className="slideshow-frame">
        {loading ? (
          <p className="slideshow-empty">Foto's laden...</p>
        ) : currentSlide ? (
          <>
            <img
              key={currentSlide.id}
              src={`${MEDIA_BASE}${currentSlide.filepath}`}
              alt={currentSlide.originalname || 'Upload'}
            />
            <div className="slideshow-caption">
              <span>{safeCurrentIndex + 1} / {slides.length}</span>
              <strong>Door {currentSlide.guest_name || 'Onbekend'}</strong>
            </div>
          </>
        ) : (
          <p className="slideshow-empty">Nog geen foto's om te tonen.</p>
        )}
      </main>
    </div>
  );
}
