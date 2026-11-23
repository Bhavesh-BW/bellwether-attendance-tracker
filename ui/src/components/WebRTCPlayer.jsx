import React, { useEffect, useRef, useState } from 'react';
import { MediaMTXWebRTCReader } from '../utils/webrtcReader';

export default function WebRTCPlayer({
  streamPath,
  cameraObj,
  onClick,
  title = '',
  style = {}
}) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'playing' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // If no stream path provided, stay idle
    const targetPath = streamPath || cameraObj?.webrtc_path || cameraObj?.id;
    if (!targetPath) return;

    setStatus('connecting');
    setErrorMessage('');

    // Determine host & WebRTC WHEP port:
    // When served from remote server (port 31030 or hostname 124.123.89.162), MediaMTX WHEP runs on NodePort 32089.
    // When run locally, MediaMTX WHEP runs on port 8889.
    const host = window.location.hostname || 'localhost';
    const targetPort = cameraObj?.webrtc_port || (window.location.port === '31030' || host === '124.123.89.162' ? 32089 : 8889);
    const whepUrl = `http://${host}:${targetPort}/${targetPath}/whep`;

    try {
      readerRef.current = new MediaMTXWebRTCReader({
        url: whepUrl,
        onError: (err) => {
          console.warn(`[WebRTC ${targetPath}] Error:`, err);
          setStatus('error');
          setErrorMessage(String(err || 'Stream disconnected'));
        },
        onTrack: (evt) => {
          if (videoRef.current && evt.streams && evt.streams[0]) {
            videoRef.current.srcObject = evt.streams[0];
            setStatus('playing');
            setErrorMessage('');
          }
        }
      });
    } catch (e) {
      console.error(`[WebRTC ${targetPath}] Initialization error:`, e);
      setStatus('error');
      setErrorMessage(e.message);
    }

    return () => {
      if (readerRef.current) {
        try {
          readerRef.current.close();
        } catch (_) {}
        readerRef.current = null;
      }
    };
  }, [streamPath, cameraObj?.id, cameraObj?.webrtc_path]);

  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#070a13',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        ...style
      }}
    >
      {/* Native WebRTC Video Element (Hardware GPU Decoded) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: status === 'playing' ? 'block' : 'none',
          pointerEvents: 'none'
        }}
      />

      {/* Connecting Spinner Indicator */}
      {status === 'connecting' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: '#38bdf8',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(56, 189, 248, 0.2)',
              borderTopColor: '#38bdf8',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Connecting Ultra-Low Latency WebRTC...</span>
        </div>
      )}

      {/* Offline / Error Indicator */}
      {status === 'error' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#ef4444',
            padding: '16px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '28px' }}>📡</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f87171' }}>
            Camera Stream Unavailable
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '260px' }}>
            {errorMessage.includes('404')
              ? 'WebRTC endpoint initializing or camera source offline'
              : errorMessage || 'RTSP signal offline; auto-reconnecting'}
          </div>
        </div>
      )}
    </div>
  );
}
