import React, { useState, useEffect } from 'react';

/**
 * DispatchAlertEmailModal - Dispatches rich alert emails via centralized AWS SES Microservice (Port 31040).
 * Supports dual visual evidence:
 * 1. Biometric Face Crop (face_crop)
 * 2. Full Body & Clothing / Trouser Context Snapshot (body_crop / photo_b64)
 */
export default function DispatchAlertEmailModal({ isOpen, onClose, alertData }) {
  if (!isOpen || !alertData) return null;

  const [toInput, setToInput] = useState('');
  const [subject, setSubject] = useState(alertData.subject || '');
  const [customNote, setCustomNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState(null); // { type: 'success' | 'error', message: string, messageId?: string }

  // Quick-select preset recipients
  const PRESET_RECIPIENTS = [
    { label: '+ HR Desk', email: 'hr.operations@medanta.org' },
    { label: '+ Security Control', email: 'security.desk@medanta.org' },
    { label: '+ Operations Lead', email: 'ops.lead@medanta.org' },
    { label: '+ My Email', email: 'bellwetherinbox01@gmail.com' }
  ];

  useEffect(() => {
    setSubject(alertData.subject || '');
    setStatusFeedback(null);
    setIsSending(false);
    setCustomNote('');
  }, [alertData]);

  const addRecipient = (email) => {
    const current = toInput.split(',').map(s => s.trim()).filter(Boolean);
    if (!current.includes(email)) {
      current.push(email);
      setToInput(current.join(', '));
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const recipients = toInput
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s.includes('@'));

    if (recipients.length === 0) {
      setStatusFeedback({ type: 'error', message: 'Please enter at least one valid email recipient.' });
      return;
    }

    setIsSending(true);
    setStatusFeedback(null);

    // Determine host: if accessing via server IP or localhost, point to port 31040 on same host
    const apiHost = window.location.hostname || '124.123.89.162';
    const emailEndpoint = `http://${apiHost}:31040/api/email/dispatch`;

    const metadata = { ...(alertData.metadata || {}) };
    if (customNote.trim()) {
      metadata['Dispatcher Note'] = customNote.trim();
    }

    const payload = {
      to: recipients,
      subject: subject.trim(),
      alert_type: alertData.alertType || 'general_alert',
      title: alertData.title,
      summary: alertData.summary,
      metadata: metadata,
      face_crop_base64: alertData.faceCrop || null,
      body_crop_base64: alertData.bodyCrop || alertData.photoB64 || null
    };

    try {
      const resp = await fetch(emailEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await resp.json();
      if (!resp.ok) {
        throw new Error(resData.detail || 'Failed to dispatch email.');
      }

      setStatusFeedback({
        type: 'success',
        message: `Alert email successfully dispatched to ${recipients.length} recipient(s)!`,
        messageId: resData.message_id
      });
    } catch (err) {
      console.error('Dispatch Email Error:', err);
      setStatusFeedback({
        type: 'error',
        message: err.message || 'Network error while contacting Email Service on port 31040.'
      });
    } finally {
      setIsSending(false);
    }
  };

  const hasFace = Boolean(alertData.faceCrop);
  const hasBody = Boolean(alertData.bodyCrop || alertData.photoB64);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#f8fafc',
          borderTopLeftRadius: '14px',
          borderTopRightRadius: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>✉️</span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                Dispatch Alert Notification Email
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Sends formal incident advisory via AWS SES with attached dual visual evidence
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSend} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Status Feedback Banner */}
          {statusFeedback && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: statusFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${statusFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              color: statusFeedback.type === 'success' ? '#166534' : '#991b1b',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{statusFeedback.type === 'success' ? '✓' : '⚠️'}</span>
                <span>{statusFeedback.message}</span>
              </div>
              {statusFeedback.messageId && (
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#15803d' }}>
                  SES Message ID: {statusFeedback.messageId}
                </div>
              )}
            </div>
          )}

          {/* Recipient Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
              Send To (Email Address or comma-separated list) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. manager@medanta.org, security@medanta.org"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              disabled={isSending}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {/* Quick Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Quick add:</span>
              {PRESET_RECIPIENTS.map(p => (
                <button
                  key={p.email}
                  type="button"
                  onClick={() => addRecipient(p.email)}
                  disabled={isSending}
                  style={{
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: '600',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject Field */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
              Subject Line *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSending}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Dual Visual Evidence Preview (Face Crop + Trouser/Body Context) */}
          {(hasFace || hasBody) && (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.4px' }}>
                📷 Attached Visual Evidence
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: hasFace && hasBody ? '1fr 1fr' : '1fr', gap: '12px' }}>
                {hasFace && (
                  <div style={{ textAlign: 'center', backgroundColor: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>
                      👤 BIOMETRIC FACE ID
                    </div>
                    <img
                      src={alertData.faceCrop.startsWith('data:') ? alertData.faceCrop : `data:image/jpeg;base64,${alertData.faceCrop}`}
                      alt="Biometric Face Crop"
                      style={{ height: '110px', width: '110px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'inline-block' }}
                    />
                  </div>
                )}
                {hasBody && (
                  <div style={{ textAlign: 'center', backgroundColor: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>
                      🧍 FULL BODY & CLOTHING / TROUSER
                    </div>
                    <img
                      src={(alertData.bodyCrop || alertData.photoB64).startsWith('data:') ? (alertData.bodyCrop || alertData.photoB64) : `data:image/jpeg;base64,${alertData.bodyCrop || alertData.photoB64}`}
                      alt="Full Body / Clothing Snapshot"
                      style={{ height: '110px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'inline-block' }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Incident Summary Key-Value List */}
          {alertData.metadata && Object.keys(alertData.metadata).length > 0 && (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 14px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                📋 Incident Metadata Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                {Object.entries(alertData.metadata).map(([k, v]) => (
                  <div key={k} style={{ fontSize: '11px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600' }}>{k}: </span>
                    <span style={{ color: '#0f172a', fontWeight: '700' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Dispatcher Note */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
              Dispatcher Note / Instructions (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Please speak with staff member regarding break policy adherence upon shift resumption."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              disabled={isSending}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'none'
              }}
            />
          </div>

          {/* Modal Footer Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '16px',
            marginTop: '4px'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {statusFeedback?.type === 'success' ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSending}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isSending ? '#94a3b8' : '#0284c7',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '700',
                cursor: isSending ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
              }}
            >
              <span>{isSending ? '⏳ Dispatching...' : '🚀 Send Email Alert'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
