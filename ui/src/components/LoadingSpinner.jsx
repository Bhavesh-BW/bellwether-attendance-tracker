import React from 'react';

/**
 * Circular spinning ring indicator for DB & filter loading states.
 */
export function LoadingSpinner({
  size = 24,
  thickness,
  color = '#0284c7',
  trackColor = 'rgba(2, 132, 199, 0.16)',
  label = null,
  sublabel = null,
  layout = 'inline',
  style = {},
  labelStyle = {}
}) {
  const stroke = thickness || Math.max(2, Math.round(size / 8));

  const ring = (
    <span
      className="bw-spinner-ring"
      role="status"
      aria-label={label || 'Loading'}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        border: `${stroke}px solid ${trackColor}`,
        borderTopColor: color,
        borderRightColor: color,
        ...style
      }}
    />
  );

  if (!label && !sublabel) {
    return ring;
  }

  const isStacked = layout === 'stacked';

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: isStacked ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isStacked ? '10px' : '8px',
        textAlign: isStacked ? 'center' : 'left'
      }}
    >
      {ring}
      <div>
        {label && (
          <div
            style={{
              fontSize: '12.5px',
              fontWeight: '700',
              color: '#0f172a',
              lineHeight: 1.3,
              ...labelStyle
            }}
          >
            {label}
          </div>
        )}
        {sublabel && (
          <div
            style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#64748b',
              marginTop: '2px'
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Frosted overlay with a centered circular spinning pill for DB/filter reloads.
 */
export function LoadingOverlay({
  visible = false,
  message = 'Loading data from database...',
  subtext = null,
  spinnerSize = 28,
  color = '#0284c7',
  trackColor = 'rgba(2, 132, 199, 0.16)',
  borderRadius = '12px',
  compact = false
}) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.78)',
        backdropFilter: 'blur(2px)',
        borderRadius,
        padding: compact ? '8px 12px' : '16px',
        pointerEvents: 'auto'
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? '10px' : '12px',
          padding: compact ? '7px 14px' : '10px 18px',
          borderRadius: '9999px',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 8px 20px -4px rgba(15, 23, 42, 0.14)'
        }}
      >
        <LoadingSpinner size={spinnerSize} color={color} trackColor={trackColor} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: compact ? '12px' : '12.5px', fontWeight: '800', color: '#0f172a', lineHeight: 1.25 }}>
            {message}
          </div>
          {subtext && (
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginTop: '1px' }}>
              {subtext}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoadingSpinner;
