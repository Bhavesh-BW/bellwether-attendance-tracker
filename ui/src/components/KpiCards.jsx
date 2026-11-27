import React, { useState } from 'react';
import { LoadingOverlay } from './LoadingSpinner';

export default function KpiCards({ kpis, period = 'today', onDataRefresh, orgId, loading = false }) {
  const p = (kpis?.period || period || 'today').toLowerCase();
  const periodLabelMap = {
    today: 'Today (Live Shift)',
    yesterday: 'Yesterday',
    '7d': 'Past 7 Days',
    '30d': 'Past 30 Days'
  };
  const pText = periodLabelMap[p] || 'Today';

  const isHospitalOrg = orgId === 'medanta';
  const isSecurityOrg = orgId === 'medanta';
  const totalDoctors = kpis?.total_doctors ?? 0;
  const doctorsPresent = kpis?.doctors_present ?? 0;
  const doctorsPct = kpis?.doctors_percent ?? 0;

  const totalPersonnel = kpis?.total_personnel ?? 224;
  const inCampusNow = kpis?.in_campus_now ?? kpis?.currently_in_hospital ?? 176;
  const inCampusPct = kpis?.in_campus_percent ?? (totalPersonnel ? Math.round((inCampusNow / totalPersonnel) * 1000) / 10 : 78.6);
  const outOfCampus = Math.max(0, totalPersonnel - inCampusNow);
  const outOfCampusPct = totalPersonnel ? Math.round((outOfCampus / totalPersonnel) * 1000) / 10 : 0;
  const checkedOut = kpis?.checked_out_today ?? 48;
  const totalStaffPresent = kpis?.total_staff_present_today ?? kpis?.total_present_today ?? (inCampusNow + checkedOut);
  const totalStaffPresentPct = kpis?.present_percent ?? (totalPersonnel ? Math.round((totalStaffPresent / totalPersonnel) * 1000) / 10 : 0);
  const presentSubtext = checkedOut > 0 
    ? `${inCampusNow} inside • ${checkedOut} departed` 
    : `${inCampusNow} active on duty`;
  const lateArrivals = kpis?.late_arrivals ?? 0;
  const latePct = kpis?.late_arrivals_percent ?? 0;
  const [selectedLateShift, setSelectedLateShift] = useState('all');
  const lateByShift = kpis?.late_by_shift || {};
  const activeShiftData = (selectedLateShift !== 'all' && lateByShift[selectedLateShift])
    ? lateByShift[selectedLateShift]
    : (lateByShift['all'] || { count: lateArrivals, percent: latePct, label: 'All Shifts' });
  const displayLateCount = activeShiftData.count ?? lateArrivals;
  const displayLatePct = activeShiftData.percent ?? latePct;
  const displayLateSubtext = selectedLateShift === 'all'
    ? 'Across assigned shifts'
    : `After ${activeShiftData.display || 'shift'} start`;
  const avgActiveTime = kpis?.avg_active_time_str || kpis?.avg_daily_time_30d || '7h 26m';
  const avgActiveDiff = kpis?.avg_active_diff_str || '+14m vs avg.';
  const productivityIndex = kpis?.productivity_index ?? 92.4;
  const avgStops = kpis?.avg_movement_stops ?? 2.1;
  const timeAtWork = kpis?.time_at_work_area ?? 88.6;

  // Late Arrival Threshold Management
  const lateTimeDisplay = kpis?.late_arrival_display || '09:00 AM';
  const lateThresholdTime = kpis?.late_arrival_time || '09:00';
  const [showLateModal, setShowLateModal] = useState(false);
  const [selectedLateTime, setSelectedLateTime] = useState(lateThresholdTime);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const PRESETS = [
    { label: '08:00 AM', value: '08:00' },
    { label: '08:30 AM', value: '08:30' },
    { label: '09:00 AM', value: '09:00' },
    { label: '09:15 AM', value: '09:15' },
    { label: '09:30 AM', value: '09:30' },
    { label: '10:00 AM', value: '10:00' }
  ];

  const handleSaveThreshold = async (timeValue) => {
    const val = timeValue || selectedLateTime;
    if (!val) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ late_arrival_time: val })
      });
      if (res.ok) {
        const data = await res.json();
        setSaveSuccessMsg(`Shift threshold updated to ${data.late_arrival_display || val}!`);
        if (onDataRefresh) {
          onDataRefresh();
        }
        setTimeout(() => {
          setShowLateModal(false);
          setSaveSuccessMsg('');
        }, 900);
      } else {
        setSaveError('Failed to save settings. Please try again.');
      }
    } catch (e) {
      setSaveError(e.message || 'Connection error');
    } finally {
      setIsSaving(false);
    }
  };

  const cards = isSecurityOrg
    ? [
        {
          id: 'total_personnel',
          label: 'Employees (Active)',
          value: Number(totalPersonnel).toLocaleString(),
          secondary: null,
          subtext: `Total personnel enrolled (Today)`,
          accent: '#2563eb', // Blue
          bgLight: '#eff6ff',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )
        },
        {
          id: 'total_present_today',
          label: 'Total Present Today',
          value: Number(totalStaffPresent).toLocaleString(),
          secondary: `(${totalStaffPresentPct}%)`,
          subtext: presentSubtext,
          accent: '#4f46e5', // Indigo
          bgLight: '#eef2ff',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          )
        },
        {
          id: 'in_campus',
          label: 'In Campus Now',
          value: Number(inCampusNow).toLocaleString(),
          secondary: `(${inCampusPct}%)`,
          subtext: `${checkedOut} departures verified today`,
          accent: '#059669', // Emerald Green
          bgLight: '#ecfdf5',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )
        },
        {
          id: 'out_of_campus',
          label: 'Out of Campus',
          value: Number(outOfCampus).toLocaleString(),
          secondary: `(${outOfCampusPct}%)`,
          subtext: `${checkedOut} departures recorded today`,
          accent: '#64748b', // Slate
          bgLight: '#f1f5f9',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          )
        },
        {
          id: 'late_arrivals',
          label: 'Late Arrivals',
          value: Number(displayLateCount).toLocaleString(),
          secondary: `(${displayLatePct}%)`,
          subtext: null,
          action: (
            <div style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%' }}>
              <select
                value={selectedLateShift}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedLateShift(e.target.value);
                }}
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  color: '#c2410c',
                  borderRadius: '5px',
                  padding: '1px 4px',
                  fontSize: '9.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: '110px',
                  width: 'auto',
                  boxSizing: 'border-box'
                }}
                title="Select shift to view late arrival count"
              >
                <option value="all">All Shifts</option>
                <option value="General Shift">General (9 AM)</option>
                <option value="Morning Shift">Morning (7 AM)</option>
                <option value="Evening Shift">Evening (3 PM)</option>
                <option value="Night Shift">Night (11 PM)</option>
              </select>
            </div>
          ),
          accent: '#ea580c', // Orange
          bgLight: '#ffedd5',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )
        }
      ]
    : [
        {
          id: 'total_personnel',
          label: 'Employees (Active)',
          value: Number(totalPersonnel).toLocaleString(),
          secondary: null,
          subtext: `Total personnel enrolled (Today)`,
          accent: '#2563eb', // Blue
          bgLight: '#eff6ff',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )
        },
        {
          id: 'total_present_today',
          label: 'Total Present Today',
          value: Number(totalStaffPresent).toLocaleString(),
          secondary: `(${totalStaffPresentPct}%)`,
          subtext: presentSubtext,
          accent: '#4f46e5', // Indigo
          bgLight: '#eef2ff',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          )
        },
        {
          id: 'in_campus',
          label: 'In Campus Now',
          value: Number(inCampusNow).toLocaleString(),
          secondary: `(${inCampusPct}%)`,
          subtext: `${checkedOut} departures verified today`,
          accent: '#059669', // Emerald Green
          bgLight: '#ecfdf5',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )
        },
        {
          id: 'avg_active_time',
          label: 'Avg. Active Time',
          value: avgActiveTime,
          secondary: null,
          subtext: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#059669', fontWeight: '700' }}>
              <span>▲</span> {avgActiveDiff}
            </span>
          ),
          accent: '#d97706', // Amber
          bgLight: '#fef3c7',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )
        },
        {
          id: 'late_arrivals',
          label: 'Late Arrivals',
          value: Number(displayLateCount).toLocaleString(),
          secondary: `(${displayLatePct}%)`,
          subtext: null,
          action: (
            <div style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%' }}>
              <select
                value={selectedLateShift}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedLateShift(e.target.value);
                }}
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  color: '#c2410c',
                  borderRadius: '5px',
                  padding: '1px 4px',
                  fontSize: '9.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: '110px',
                  width: 'auto',
                  boxSizing: 'border-box'
                }}
                title="Select shift to view late arrival count"
              >
                <option value="all">All Shifts</option>
                <option value="General Shift">General (9 AM)</option>
                <option value="Morning Shift">Morning (7 AM)</option>
                <option value="Evening Shift">Evening (3 PM)</option>
                <option value="Night Shift">Night (11 PM)</option>
              </select>
            </div>
          ),
          accent: '#ea580c', // Orange
          bgLight: '#ffedd5',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )
        },
        {
          id: 'attendance_rate',
          label: 'Attendance Rate',
          value: `${inCampusPct}%`,
          secondary: null,
          subtext: `${inCampusNow} of ${totalPersonnel} staff on premises`,
          accent: '#7c3aed', // Purple
          bgLight: '#f5f3ff',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <polyline points="9 16 11 18 15 14"/>
            </svg>
          )
        },
        {
          id: 'productivity_index',
          label: 'Productivity Index',
          value: `${productivityIndex}%`,
          secondary: null,
          subtext: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#059669', fontWeight: '700' }}>
              <span>▲</span> +2.4 pp shift score
            </span>
          ),
          accent: '#10b981', // Emerald
          bgLight: '#ecfdf5',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="16" height="10" rx="2" ry="2" />
              <line x1="22" y1="11" x2="22" y2="13" />
              <line x1="6" y1="11" x2="6" y2="13" />
              <line x1="10" y1="11" x2="10" y2="13" />
            </svg>
          )
        },
        {
          id: 'movement_stops',
          label: 'Avg. Movement Stops',
          value: avgStops,
          secondary: null,
          subtext: 'Checkpoints per employee',
          accent: '#0284c7', // Sky Blue
          bgLight: '#f0f9ff',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
            </svg>
          )
        },
        {
          id: 'time_at_work',
          label: 'Time at Work Area',
          value: `${timeAtWork}%`,
          secondary: null,
          subtext: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#059669', fontWeight: '700' }}>
              <span>▲</span> Active Work Zones
            </span>
          ),
          accent: '#e11d48', // Rose / Red
          bgLight: '#ffe4e6',
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          )
        }
      ];

  return (
    <>
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <div
          className={`kpi-cards-grid ${isSecurityOrg ? 'kpi-cards-grid-security' : ''}`}
          style={{
            marginBottom: 0,
            opacity: loading ? 0.55 : 1,
            transition: 'opacity 0.15s ease',
            ...(isSecurityOrg ? { gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' } : {})
          }}
        >
          {cards.map((card) => (
          <div 
            key={card.id}
            className="med-card"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '10px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
          >
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: card.bgLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {card.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {card.label}
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: '800',
                color: '#0f172a',
                lineHeight: '1.2',
                display: 'flex',
                alignItems: 'baseline',
                gap: '4px',
                flexWrap: 'wrap'
              }}>
                <span>{card.value}</span>
                {card.secondary && (
                  <span style={{ fontSize: '11px', fontWeight: '700', color: card.accent }}>
                    {card.secondary}
                  </span>
                )}
              </div>
              {card.subtext && (
                <div style={{
                  fontSize: '10px',
                  color: '#94a3b8',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {card.subtext}
                </div>
              )}
              {card.action && (
                <div style={{ marginTop: '2px' }}>{card.action}</div>
              )}
            </div>
          </div>
          ))}
        </div>
        <LoadingOverlay
          visible={loading}
          compact
          spinnerSize={20}
          message={!kpis ? 'Loading attendance metrics from database...' : `Loading ${pText} metrics...`}
        />
      </div>

      {/* Late Arrival Threshold Settings Modal */}
      {showLateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => setShowLateModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#ffedd5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '16px' }}>⏰</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                    Configure Shift Start / Late Cutoff
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                    Staff checking in after this time will be flagged as Late Arrivals
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                  Quick Shift Start Presets:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {PRESETS.map((preset) => {
                    const isSelected = selectedLateTime === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setSelectedLateTime(preset.value)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #ea580c' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#fff7ed' : '#ffffff',
                          color: isSelected ? '#ea580c' : '#334155',
                          fontWeight: isSelected ? '800' : '600',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Or Custom Threshold (24h HH:MM):
                </label>
                <input
                  type="time"
                  value={selectedLateTime}
                  onChange={(e) => setSelectedLateTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    fontWeight: '700',
                    color: '#0f172a',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {saveSuccessMsg && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>✓</span> {saveSuccessMsg}
                </div>
              )}

              {saveError && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  marginBottom: '12px'
                }}>
                  {saveError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setShowLateModal(false)}
                disabled={isSaving}
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
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveThreshold(selectedLateTime)}
                disabled={isSaving}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: isSaving ? 'wait' : 'pointer',
                  boxShadow: '0 1px 2px rgba(234, 88, 12, 0.3)'
                }}
              >
                {isSaving ? 'Updating...' : 'Save & Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
