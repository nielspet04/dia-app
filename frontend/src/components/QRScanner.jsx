import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';

export default function QRScanner({ onSuccess }) {
  const scannerRef = useRef(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const qrscanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      false
    );

    qrscanner.render(
      (decodedText) => {
        console.log('QR Code scanned:', decodedText);
        onSuccess(decodedText);
        qrscanner.clear();
      },
      () => {
        // Ignore errors during scanning
      }
    );

    scannerRef.current = qrscanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, [onSuccess]);

  const handleQRImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    try {
      const html5QrCode = new Html5Qrcode('hidden-qr-reader');
      const result = await html5QrCode.scanFile(file, true);
      console.log('QR Code from image:', result.decodedText);
      onSuccess(result.decodedText);
      await html5QrCode.clear();
    } catch (error) {
      setUploadError('❌ Geen QR code gevonden in afbeelding');
      console.error('QR scan error:', error);
    }
  };

  return (
    <div className="qr-scanner">
      <div id="qr-reader"></div>
      <div id="hidden-qr-reader" style={{ display: 'none' }}></div>
      <p className="qr-hint">📷 Richt je camera op de QR code</p>
      
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.9em', marginBottom: '10px' }}>of</p>
        <label htmlFor="qr-upload" style={{
          display: 'inline-block',
          padding: '10px 16px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          fontSize: '0.95em'
        }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
           onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}>
          📁 Upload QR code afbeelding
        </label>
        <input
          id="qr-upload"
          type="file"
          accept="image/jpeg,image/png,image/gif"
          onChange={handleQRImageUpload}
          style={{ display: 'none' }}
        />
      </div>
      
      {uploadError && <p style={{ color: 'var(--error)', marginTop: '10px' }}>{uploadError}</p>}
    </div>
  );
}
