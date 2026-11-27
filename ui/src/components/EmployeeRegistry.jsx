
// Helper to process and auto-downscale uploaded photos to max 400x400 JPEG (~30KB)
const processImageFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 400;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import DispatchAlertEmailModal from './DispatchAlertEmailModal';
import { LoadingSpinner, LoadingOverlay } from './LoadingSpinner';

const DEPARTMENTS = [
  'General Staff', 'Management & Leadership', 'Operations', 'Engineering & Tech',
  'Human Resources', 'Finance & Accounting', 'Sales & Marketing',
  'Customer Support', 'Security & Surveillance', 'Facility Support',
  'Orthopaedics', 'Cardiology', 'Emergency & Trauma', 'Nursing Services'
];

const ROLES = [
  'Staff Member', 'Team Lead', 'Manager', 'Director', 'Engineer',
  'Executive', 'Officer', 'Consultant', 'Admin Staff', 'Facility Support',
  'Security Officer', 'Intern', 'Specialist'
];

const fmtTime = (ts) => {
  if (!ts) return '—';
  if (typeof ts === 'string' && /am|pm/i.test(ts)) return ts;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.includes('T') ? ts.split('T')[1].slice(0, 5) : ts.slice(0, 5);
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
};

export default function EmployeeRegistry({
  visitors = [],
  cameras = [],
  onDataRefresh,
  onSelectEmployee,
  autoEnrollEnabled = true,
  onToggleAutoEnroll,
  watchlist = [],
  onBlacklist,
  onRemoveBlacklist,
  onEnrollManual,
  onDeleteEmployee,
  activeSectionProp,
  onSectionChange,
  activeOrgId,
  isLoading = false
}) {
  // Top Tabs: 'details' (Employee Details) | 'absent' (Absent from Premises) | 'auto_enroll' (Auto-Enrolled Profiles) | 'watchlist' (Security Watchlist)
  const [activeSection, setActiveSection] = useState(activeSectionProp || 'details');
  useEffect(() => {
    if (activeSectionProp) {
      setActiveSection(activeSectionProp);
    }
  }, [activeSectionProp]);

  const switchSection = (sec) => {
    setActiveSection(sec);
    if (onSectionChange) onSectionChange(sec);
  };

  // State for Dispatch Alert Email Modal
  const [emailAlertModalData, setEmailAlertModalData] = useState(null);

  // -------------------------------------------------------------
  // ATTENDANCE & SHIFT LEDGER STATE
  // -------------------------------------------------------------
  const [ledgerDate, setLedgerDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSyncing, setLedgerSyncing] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerDeptFilter, setLedgerDeptFilter] = useState('all');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState('all'); // 'all', 'on_duty', 'checked_out', 'absent'
  const ledgerDataRef = useRef(null);

  // Sub-tab state for Absent from Premises View
  const [absentSubTab, setAbsentSubTab] = useState('currently_away'); // 'currently_away' | 'extended_log'
  const [extendedStatusFilter, setExtendedStatusFilter] = useState('all'); // 'all' | 'away' | 'returned'
  const [absencePolicyFilter, setAbsencePolicyFilter] = useState('all'); // 'all' | 'short' | 'extended'
  const [extendedSearch, setExtendedSearch] = useState('');

  // Absence Policy threshold (editable directly in UI, default 60m, persisted in localStorage)
  const [absencePolicyMinutes, setAbsencePolicyMinutes] = useState(() => {
    try {
      const saved = localStorage.getItem('godezk_absence_policy_minutes');
      return saved ? Math.max(5, parseInt(saved, 10) || 60) : 60;
    } catch (e) {
      return 60;
    }
  });

  // Absence Multi-Day Date Filter ('today' | 'yesterday' | '3d' | '7d' | 'custom')
  const [absencePeriod, setAbsencePeriod] = useState('today');
  const [absenceCustomStart, setAbsenceCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [absenceCustomEnd, setAbsenceCustomEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Absence Duration Filter ('all' | 'lt30' | '30to60' | 'gt60' | 'gt120' | 'gt180' | 'custom')
  const [absenceDurationFilter, setAbsenceDurationFilter] = useState('all');
  const [customDurationMins, setCustomDurationMins] = useState(60);
  const [customDurationOp, setCustomDurationOp] = useState('gt'); // 'gt' | 'gte' | 'lt'

  useEffect(() => {
    ledgerDataRef.current = ledgerData;
  }, [ledgerData]);

  // Available cameras (with fallback if empty)
  const availableCameras = useMemo(() => {
    if (cameras && cameras.length > 0) return cameras;
    return [
      { id: 'cam_2363ea', name: 'Office entry', role: 'entry', location: 'Main gate' },
      { id: 'cam_ffca39', name: 'Office exit door', role: 'exit', location: 'Exit door' },
      { id: 'cam_5ab380', name: 'Cabin 1 Camera', role: 'internal', location: 'Cabin 1' },
      { id: 'cam_571115', name: 'Cash Table', role: 'internal', location: 'Cash Table' }
    ];
  }, [cameras]);

  // -------------------------------------------------------------
  // ZONE INTRUSIONS STATE & ACTIONS
  // -------------------------------------------------------------
  const [zoneIntrusions, setZoneIntrusions] = useState([]);
  const [zoneLoading, setZoneLoading] = useState(false);
  const zoneReqIdRef = useRef(0);
  const [zoneSearch, setZoneSearch] = useState('');
  const [zoneStatusFilter, setZoneStatusFilter] = useState('all'); // 'all', 'active', 'acknowledged'
  const [zoneCameraFilter, setZoneCameraFilter] = useState('all');
  const [zoneDateFilter, setZoneDateFilter] = useState('');
  const [editingEmployeeModal, setEditingEmployeeModal] = useState(null);
  const [editEmployeeForm, setEditEmployeeForm] = useState({ name: '', department: '', designation: '', restricted_cameras: [] });
  const [editEmployeeCrops, setEditEmployeeCrops] = useState([]);
  const [isEditPhotoLoading, setIsEditPhotoLoading] = useState(false);
  const editAddPhotoInputRef = React.useRef(null);
  const editReplacePhotoInputRef = React.useRef(null);
  const [savingEmployeeEdit, setSavingEmployeeEdit] = useState(false);

  const fetchZoneIntrusions = useCallback(async (isSilent = false) => {
    const reqId = ++zoneReqIdRef.current;
    if (!isSilent) {
      setZoneLoading(true);
    }
    try {
      const orgParam = activeOrgId ? `&org_id=${encodeURIComponent(activeOrgId)}` : '';
      const dateParam = zoneDateFilter ? `&date=${encodeURIComponent(zoneDateFilter)}` : '';
      const statusParam = zoneStatusFilter && zoneStatusFilter !== 'all' ? `&status=${encodeURIComponent(zoneStatusFilter)}` : '';
      const res = await fetch(`/api/zone-intrusions?limit=200${orgParam}${dateParam}${statusParam}&_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (reqId === zoneReqIdRef.current) {
          setZoneIntrusions(data.intrusions || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch zone intrusions:', err);
    } finally {
      if (reqId === zoneReqIdRef.current) {
        setZoneLoading(false);
      }
    }
  }, [activeOrgId, zoneDateFilter, zoneStatusFilter]);

  useEffect(() => {
    fetchZoneIntrusions(false);
    const interval = setInterval(() => fetchZoneIntrusions(true), 5000);
    return () => clearInterval(interval);
  }, [fetchZoneIntrusions]);

  const handleAcknowledgeIntrusion = async (id) => {
    try {
      const res = await fetch('/api/zone-intrusions/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, acknowledged_by: 'Security Officer' })
      });
      if (res.ok) {
        showNotice('✓ Intrusion alert acknowledged');
        fetchZoneIntrusions();
      }
    } catch (err) {
      showNotice('Failed to acknowledge alert', false);
    }
  };

  const handleAcknowledgeAllIntrusions = async () => {
    const activeIds = zoneIntrusions.filter(z => z.status === 'active').map(z => z.id);
    if (!activeIds.length) return;
    try {
      const res = await fetch('/api/zone-intrusions/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: activeIds, acknowledged_by: 'Security Officer' })
      });
      if (res.ok) {
        showNotice(`✓ Acknowledged ${activeIds.length} intrusion alerts`);
        fetchZoneIntrusions();
      }
    } catch (err) {
      showNotice('Failed to acknowledge alerts', false);
    }
  };

  const handleDeleteIntrusion = async (id) => {
    if (!window.confirm('Delete this zone intrusion record?')) return;
    try {
      const res = await fetch('/api/zone-intrusions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        showNotice('✓ Intrusion record deleted');
        fetchZoneIntrusions();
      }
    } catch (err) {
      showNotice('Failed to delete record', false);
    }
  };

  const openEditModal = (v, e) => {
    if (e) e.stopPropagation();
    let restr = v.restricted_cameras || [];
    if (typeof restr === 'string') {
      try { restr = JSON.parse(restr); } catch { restr = []; }
    }
    setEditingEmployeeModal(v);
    const initialCrops = Array.isArray(v.crops) && v.crops.length > 0 ? v.crops : (v.photo_b64 ? [v.photo_b64] : []);
    setEditEmployeeCrops(initialCrops);
    setEditEmployeeForm({
      name: v.name || v.display_name || '',
      department: v.department || 'General Staff',
      designation: v.designation || 'Staff Member',
      restricted_cameras: Array.isArray(restr) ? [...restr] : []
    });
  };

  const handleSaveEmployeeModal = async (e) => {
    if (e) e.preventDefault();
    if (!editingEmployeeModal) return;
    setSavingEmployeeEdit(true);
    try {
      const res = await fetch('/api/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: editingEmployeeModal.id,
          name: editEmployeeForm.name || undefined,
          department: editEmployeeForm.department,
          designation: editEmployeeForm.designation,
          restricted_cameras: editEmployeeForm.restricted_cameras
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      showNotice(`✓ Updated zone permissions for ${editEmployeeForm.name || editingEmployeeModal.id}`);
      setEditingEmployeeModal(null);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(err.message || 'Error updating employee', false);
    } finally {
      setSavingEmployeeEdit(false);
    }
  };


  const handleEditModalDeleteCrop = async (cropIdx) => {
    if (!editingEmployeeModal) return;
    const targetCrop = editEmployeeCrops[cropIdx];
    if (!targetCrop) return;
    if (!window.confirm(`Delete angle capture #${cropIdx + 1}?`)) return;

    setIsEditPhotoLoading(true);
    try {
      const res = await fetch('/api/visitors/remove-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: editingEmployeeModal.id,
          crop_index: cropIdx,
          crop_b64: targetCrop
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove crop');

      const nextCrops = Array.isArray(data.crops) ? data.crops : editEmployeeCrops.filter((_, i) => i !== cropIdx);
      setEditEmployeeCrops(nextCrops);
      setEditingEmployeeModal(prev => prev ? { ...prev, crops: nextCrops, photo_b64: data.photo_b64 || (nextCrops[0] || null) } : prev);
      showNotice(`✓ Angle #${cropIdx + 1} deleted and AI biometrics re-indexed`);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(err.message || 'Error deleting angle', false);
    } finally {
      setIsEditPhotoLoading(false);
    }
  };

  const handleEditModalUploadPhotos = async (e, action = 'add') => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !editingEmployeeModal) return;

    setIsEditPhotoLoading(true);
    try {
      const b64List = [];
      for (const f of files) {
        const b64 = await processImageFile(f);
        if (b64) b64List.push(b64);
      }
      if (!b64List.length) throw new Error('No valid image files processed');

      const res = await fetch('/api/employees/update-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: editingEmployeeModal.id,
          action,
          photos_b64: b64List
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update photos');

      const nextCrops = Array.isArray(data.crops) ? data.crops : editEmployeeCrops;
      setEditEmployeeCrops(nextCrops);
      setEditingEmployeeModal(prev => prev ? { ...prev, crops: nextCrops, photo_b64: data.photo_b64 || (nextCrops[0] || null), is_enrolled: 1 } : prev);
      showNotice(action === 'replace' ? `✓ Replaced biometrics with ${b64List.length} photo(s)` : `✓ Added ${b64List.length} angle photo(s)`);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(err.message || 'Error uploading photo', false);
    } finally {
      setIsEditPhotoLoading(false);
      e.target.value = '';
    }
  };

  const toggleRestrictedCamera = (camId) => {
    setEditEmployeeForm(prev => {
      const current = prev.restricted_cameras || [];
      const exists = current.includes(camId);
      const next = exists ? current.filter(c => c !== camId) : [...current, camId];
      return { ...prev, restricted_cameras: next };
    });
  };

  const filteredZoneIntrusions = useMemo(() => {
    return zoneIntrusions.filter(z => {
      if (zoneStatusFilter && zoneStatusFilter !== 'all' && z.status !== zoneStatusFilter) return false;
      if (zoneCameraFilter && zoneCameraFilter !== 'all' && z.camera_id !== zoneCameraFilter && z.camera_name !== zoneCameraFilter) return false;
      if (zoneDateFilter && z.date !== zoneDateFilter) return false;
      if (zoneSearch.trim()) {
        const q = zoneSearch.toLowerCase();
        const matchEmp = (z.employee_name || '').toLowerCase().includes(q) || (z.employee_id || '').toLowerCase().includes(q);
        const matchDept = (z.department || '').toLowerCase().includes(q);
        const matchCam = (z.camera_name || '').toLowerCase().includes(q) || (z.camera_id || '').toLowerCase().includes(q);
        if (!matchEmp && !matchDept && !matchCam) return false;
      }
      return true;
    });
  }, [zoneIntrusions, zoneStatusFilter, zoneCameraFilter, zoneDateFilter, zoneSearch]);

  const zoneKpis = useMemo(() => {
    const total = zoneIntrusions.length;
    const active = zoneIntrusions.filter(z => z.status === 'active').length;
    const uniqueViolators = new Set(zoneIntrusions.map(z => z.employee_id)).size;
    const camCounts = {};
    zoneIntrusions.forEach(z => {
      const key = z.camera_name || z.camera_id;
      if (key) camCounts[key] = (camCounts[key] || 0) + 1;
    });
    let mostBreached = '—';
    let maxBreaches = 0;
    Object.entries(camCounts).forEach(([cam, count]) => {
      if (count > maxBreaches) {
        maxBreaches = count;
        mostBreached = `${cam} (${count})`;
      }
    });
    return { total, active, uniqueViolators, mostBreached };
  }, [zoneIntrusions]);

  // Single Employee Manual Override Modal
  const [singleOverrideOpen, setSingleOverrideOpen] = useState(false);
  const [overrideEmp, setOverrideEmp] = useState(null);
  const [overrideAction, setOverrideAction] = useState('check_out');
  const [overrideTime, setOverrideTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [overrideDate, setOverrideDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [overrideReason, setOverrideReason] = useState('Admin Manual Override');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideNotice, setOverrideNotice] = useState(null);

  // Bulk Shift Check-Out Modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTime, setBulkTime] = useState('17:00');
  const [bulkDate, setBulkDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [bulkReason, setBulkReason] = useState('Shift End Regular Check-Out');
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkNotice, setBulkNotice] = useState(null);

  const ledgerReqIdRef = useRef(0);

  const fetchLedger = useCallback(async (isSilent = false) => {
    const reqId = ++ledgerReqIdRef.current;
    if (!isSilent) {
      setLedgerLoading(true);
    } else {
      setLedgerSyncing(true);
    }
    try {
      let url = `/api/attendance/ledger?org_id=${encodeURIComponent(activeOrgId || '')}&_t=${Date.now()}`;
      if (activeSection === 'absent' && absentSubTab === 'extended_log' && absencePeriod !== 'today') {
        url += `&period=${encodeURIComponent(absencePeriod)}`;
        if (absencePeriod === 'custom') {
          url += `&start_date=${encodeURIComponent(absenceCustomStart)}&end_date=${encodeURIComponent(absenceCustomEnd)}`;
        }
      } else {
        url += `&date=${encodeURIComponent(ledgerDate)}`;
      }
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (reqId !== ledgerReqIdRef.current) return;
      ledgerDataRef.current = data;
      setLedgerData(data);
    } catch (err) {
      console.error('Failed to load attendance ledger:', err);
    } finally {
      if (reqId === ledgerReqIdRef.current) {
        setLedgerLoading(false);
        setLedgerSyncing(false);
      }
    }
  }, [ledgerDate, activeOrgId, activeSection, absentSubTab, absencePeriod, absenceCustomStart, absenceCustomEnd]);

  // Reload with loading spinner whenever shift date or active organization changes
  useEffect(() => {
    fetchLedger(false);
  }, [fetchLedger]);

  // Silent background refresh when sightings update, keeping UI completely stable without flicker
  useEffect(() => {
    if ((activeSection === 'ledger' || activeSection === 'absent') && ledgerDataRef.current) {
      fetchLedger(true);
    }
  }, [visitors, activeSection, fetchLedger]);

  const openSingleOverride = (emp, defaultAction = 'check_out') => {
    setOverrideEmp(emp);
    setOverrideAction(defaultAction);
    const d = new Date();
    setOverrideTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setOverrideDate(ledgerDate);
    setOverrideReason('Admin Manual Override');
    setOverrideNotice(null);
    setSingleOverrideOpen(true);
  };

  const handleSingleOverrideSubmit = async () => {
    if (!overrideEmp) return;
    setOverrideLoading(true);
    setOverrideNotice(null);
    try {
      const targetId = overrideEmp.employee_id || overrideEmp.id;
      const timestamp = `${overrideDate}T${overrideTime}:00`;
      const res = await fetch('/api/attendance/manual-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: targetId,
          action: overrideAction,
          timestamp,
          date: overrideDate,
          reason: overrideReason
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to apply manual override');
      }
      setOverrideNotice({ ok: true, msg: `✓ Override applied for ${overrideEmp.name || targetId}!` });
      setTimeout(() => {
        setSingleOverrideOpen(false);
        setOverrideNotice(null);
      }, 1000);
      fetchLedger();
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      setOverrideNotice({ ok: false, msg: err.message });
    } finally {
      setOverrideLoading(false);
    }
  };

  const handleBulkCheckoutSubmit = async () => {
    const ids = Array.from(bulkSelectedIds);
    if (ids.length === 0) {
      alert("Please select at least one employee for bulk check-out.");
      return;
    }
    setBulkLoading(true);
    setBulkNotice(null);
    try {
      const timestamp = `${bulkDate}T${bulkTime}:00`;
      const res = await fetch('/api/attendance/bulk-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids: ids,
          timestamp,
          date: bulkDate,
          org_id: activeOrgId || undefined,
          reason: bulkReason
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Bulk check-out failed');
      }
      setBulkNotice({ ok: true, msg: `✓ Successfully checked out ${data.count} staff members at ${bulkTime}!` });
      setTimeout(() => {
        setBulkOpen(false);
        setBulkNotice(null);
      }, 1200);
      fetchLedger();
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      setBulkNotice({ ok: false, msg: err.message });
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredLedgerEmployees = useMemo(() => {
    if (!ledgerData || !ledgerData.employees) return [];
    return ledgerData.employees.filter(e => {
      if (ledgerDeptFilter !== 'all' && (e.department || 'General Staff') !== ledgerDeptFilter) return false;
      if (ledgerStatusFilter === 'enrolled' && !e.is_enrolled) return false;
      if (ledgerStatusFilter === 'auto' && e.is_enrolled) return false;
      if (ledgerStatusFilter === 'on_duty' && e.status !== 'On Duty') return false;
      if (ledgerStatusFilter === 'checked_out' && e.status !== 'Checked Out') return false;
      if (ledgerStatusFilter === 'absent' && e.status !== 'Absent') return false;
      if (ledgerStatusFilter === 'early' && !e.is_early_checkin) return false;
      if (ledgerStatusFilter === 'late_in' && !e.is_late_arrival) return false;
      if (ledgerStatusFilter === 'late_exit' && !e.is_late_night_exit) return false;
      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase();
        const id = (e.employee_id || e.id || '').toLowerCase();
        const name = (e.name || '').toLowerCase();
        const dept = (e.department || '').toLowerCase();
        const desig = (e.designation || '').toLowerCase();
        if (!id.includes(q) && !name.includes(q) && !dept.includes(q) && !desig.includes(q)) return false;
      }
      return true;
    });
  }, [ledgerData, ledgerDeptFilter, ledgerStatusFilter, ledgerSearch]);

  const autoEnrolledStaff = useMemo(() => {
    return visitors.filter(v => !v.is_enrolled);
  }, [visitors]);

  const enrolledStaffCount = useMemo(() => {
    return visitors.filter(v => Boolean(v.is_enrolled)).length;
  }, [visitors]);

  const ledgerEnrolledCount = useMemo(() => {
    return (ledgerData?.employees || []).filter(e => e.is_enrolled).length;
  }, [ledgerData]);

  const ledgerAutoCount = useMemo(() => {
    return (ledgerData?.employees || []).filter(e => !e.is_enrolled).length;
  }, [ledgerData]);

  const watchlistIds = useMemo(() => {
    const s = new Set();
    (watchlist || []).forEach(w => {
      if (w.id) s.add(String(w.id).toLowerCase());
      if (w.alias) s.add(String(w.alias).toLowerCase());
    });
    return s;
  }, [watchlist]);

  const combinedWatchlist = useMemo(() => {
    const list = [...(watchlist || [])];
    const seenIds = new Set(list.map(w => String(w.alias || w.id || '').toLowerCase()));
    
    visitors.forEach(v => {
      if (v.is_blacklisted && v.id && !seenIds.has(String(v.id).toLowerCase())) {
        seenIds.add(String(v.id).toLowerCase());
        list.push({
          id: `BLK-${v.id}`,
          alias: v.id,
          name: v.name || v.display_name || v.id,
          category: v.department || 'General Staff',
          reason: v.blacklist_reason || 'Security Watchlist Notification',
          photo_b64: v.photo_b64 || (v.crops && v.crops[0]) || null,
          crops: v.crops || [],
          enrolled_at: v.last_seen || new Date().toISOString()
        });
      }
    });
    return list;
  }, [watchlist, visitors]);

  const allVisitorsWithWatchlist = useMemo(() => {
    const list = [...visitors];
    const existingIds = new Set(visitors.map(v => String(v.id || '').toLowerCase()));
    combinedWatchlist.forEach(w => {
      const wid = String(w.alias || w.id || '');
      if (wid && !existingIds.has(wid.toLowerCase())) {
        existingIds.add(wid.toLowerCase());
        list.push({
          id: wid,
          name: w.name || wid,
          display_name: w.name || wid,
          department: w.category || 'General Staff',
          designation: 'Watchlist Target',
          is_enrolled: false,
          is_blacklisted: true,
          blacklist_reason: w.reason || 'Security Watchlist',
          photo_b64: w.photo_b64 || (w.crops && w.crops[0]) || null,
          crops: w.crops || (w.photo_b64 ? [w.photo_b64] : []),
          today_check_in: null,
          last_seen: w.enrolled_at || null,
          today_status: 'NOT SEEN TODAY'
        });
      }
    });
    return list;
  }, [visitors, combinedWatchlist]);

  const blacklistedStaffCount = useMemo(() => {
    return allVisitorsWithWatchlist.filter(v => v.is_blacklisted || watchlistIds.has(String(v.id).toLowerCase())).length;
  }, [allVisitorsWithWatchlist, watchlistIds]);

  const [addWatchlistOpen, setAddWatchlistOpen] = useState(false);
  const [watchlistForm, setWatchlistForm] = useState({
    id: '',
    name: '',
    reasonPreset: 'Security Screening Required',
    reasonCustom: '',
    photoB64: null
  });
  const [watchlistPhotoPreview, setWatchlistPhotoPreview] = useState(null);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [watchlistSearch, setWatchlistSearch] = useState('');

  const filteredWatchlist = useMemo(() => {
    return combinedWatchlist.filter(w => {
      if (!watchlistSearch.trim()) return true;
      const q = watchlistSearch.toLowerCase();
      const n = (w.name || '').toLowerCase();
      const a = (w.alias || w.id || '').toLowerCase();
      const r = (w.reason || '').toLowerCase();
      const c = (w.category || '').toLowerCase();
      return n.includes(q) || a.includes(q) || r.includes(q) || c.includes(q);
    });
  }, [combinedWatchlist, watchlistSearch]);

  const handleWatchlistPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result;
      setWatchlistForm(p => ({ ...p, photoB64: b64 }));
      setWatchlistPhotoPreview(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleAddWatchlist = async (e) => {
    if (e) e.preventDefault();
    const finalReason = watchlistForm.reasonPreset === 'Custom'
      ? (watchlistForm.reasonCustom || 'Security Screening Required')
      : watchlistForm.reasonPreset;
    const targetId = (watchlistForm.id || '').trim();
    const targetName = (watchlistForm.name || '').trim() || targetId || 'Flagged Person';

    if (!targetId && !targetName && !watchlistForm.photoB64) {
      alert("Please provide an ID, Name, or Photo to blacklist.");
      return;
    }

    setSavingWatchlist(true);
    try {
      if (watchlistForm.photoB64 && onEnrollManual) {
        await onEnrollManual(watchlistForm.photoB64, targetName, finalReason);
      } else if (onBlacklist) {
        await onBlacklist(targetId || targetName, targetName, finalReason);
      }
      showNotice(`✓ Added ${targetName} to Security Watchlist`);
      setAddWatchlistOpen(false);
      setWatchlistForm({ id: '', name: '', reasonPreset: 'Security Screening Required', reasonCustom: '', photoB64: null });
      setWatchlistPhotoPreview(null);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(`Failed to add: ${err.message}`, false);
    } finally {
      setSavingWatchlist(false);
    }
  };

  // Live timer tick for real-time missing duration updates
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [absentFilter, setAbsentFilter] = useState('all'); // 'all' | 'lt30' | 'gt30' | 'gt60'
  const [sortBy, setSortBy] = useState('latest_seen');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', department: 'General Staff', designation: 'Staff Member', employee_id: '' });
  const [facePhotos, setFacePhotos] = useState([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const showNotice = (msg, ok = true) => {
    setNotice({ msg, ok });
    setTimeout(() => setNotice(null), 3500);
  };

  const handleDeleteEmployee = async (empId, empName, e) => {
    if (e) e.stopPropagation();
    const name = empName || empId;
    if (!window.confirm(`Permanently delete profile "${name}" (${empId})?\n\nThis will remove all face crops, sightings, and attendance history.`)) {
      return;
    }
    try {
      if (onDeleteEmployee) {
        await onDeleteEmployee(empId);
      } else {
        const res = await fetch('/api/visitors/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitor_id: empId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete profile');
      }
      showNotice(`✓ Profile ${name} deleted`);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(err.message || 'Error deleting profile', false);
    }
  };

  const handleDeleteAllAutoEnrolled = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL auto-enrolled profiles (${autoEnrolledStaff.length})?\n\nRegistered doctors and staff will be preserved.`)) {
      return;
    }
    try {
      const res = await fetch('/api/visitors/delete-auto-enrolled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: activeOrgId })
      });
      const data = await res.json();
      if (res.ok) {
        showNotice(`✓ ${data.message || 'Auto-enrolled profiles deleted'}`);
        if (onDataRefresh) onDataRefresh();
      } else {
        throw new Error(data.error || 'Failed to delete');
      }
    } catch (err) {
      showNotice(err.message || 'Error deleting auto-enrolled profiles', false);
    }
  };

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = Math.max(0, 6 - facePhotos.length);
    if (remaining <= 0) {
      alert("Maximum 6 face angle images allowed.");
      return;
    }
    const toLoad = files.slice(0, remaining);
    toLoad.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result;
        setFacePhotos(prev => {
          if (prev.length >= 6) return prev;
          return [...prev, b64];
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhotoAt = (index) => {
    setFacePhotos(prev => prev.filter((_, i) => i !== index));
  };

  const clearPhotos = () => {
    setFacePhotos([]);
  };

  // Employees absent from premises during active duty hours (Checked in today, actively on duty, crossed exit gate and have not returned)
  const absentStaff = useMemo(() => {
    return visitors.filter(v => {
      // Exclude staff whose shift has officially ended via verified manual checkout
      const isManualOut = Boolean(v.is_checkout_verified && (v.today_check_out_camera === 'manual_exit' || String(v.today_check_out_camera_name || '').toLowerCase().includes('manual')));
      if (isManualOut || v.is_shift_ended) return false;

      const hasCheckedIn = Boolean(v.today_check_in);
      if (!hasCheckedIn) return false;

      const isExitLast = (v.camera_id && String(v.camera_id).toLowerCase().includes('exit')) ||
                         (v.last_camera && String(v.last_camera).toLowerCase().includes('exit')) ||
                         (v.camera_name && String(v.camera_name).toLowerCase().includes('exit')) ||
                         (v.last_camera_name && String(v.last_camera_name).toLowerCase().includes('exit'));
      const isMarkedAbsent = Boolean(v.is_absent_from_premises);

      return isMarkedAbsent || isExitLast;
    }).map(v => {
      let missingMins = v.missing_mins || 0;
      const exitIso = v.exit_time_iso || v.today_check_out_raw || v.last_seen;
      if (exitIso) {
        try {
          const exitD = new Date(exitIso);
          if (!isNaN(exitD.getTime())) {
            missingMins = Math.max(1, Math.floor((nowTs - exitD.getTime()) / 60000));
          }
        } catch {
          missingMins = v.missing_mins || 1;
        }
      }
      if (missingMins < 1) missingMins = v.missing_mins || 1;

      let missingStr = v.missing_duration_str;
      if (missingMins >= 60) {
        const h = Math.floor(missingMins / 60);
        const m = missingMins % 60;
        missingStr = `${h}h ${String(m).padStart(2, '0')}m`;
      } else {
        missingStr = `${missingMins}m`;
      }

      return {
        ...v,
        live_missing_mins: missingMins,
        live_missing_str: missingStr
      };
    }).sort((a, b) => b.live_missing_mins - a.live_missing_mins);
  }, [visitors, nowTs]);

  // Absent staff filtered
  const filteredAbsent = useMemo(() => {
    return absentStaff.filter(v => {
      if (deptFilter !== 'all' && (v.department || 'General Staff') !== deptFilter) return false;
      if (absentFilter === 'lt30' && v.live_missing_mins >= 30) return false;
      if (absentFilter === 'gt30' && v.live_missing_mins < 30) return false;
      if (absentFilter === 'gt60' && v.live_missing_mins < 60) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const id = (v.id || '').toLowerCase();
        const name = (v.name || v.display_name || '').toLowerCase();
        const dept = (v.department || '').toLowerCase();
        const desig = (v.designation || '').toLowerCase();
        if (!id.includes(q) && !name.includes(q) && !dept.includes(q) && !desig.includes(q)) return false;
      }
      return true;
    });
  }, [absentStaff, deptFilter, absentFilter, search]);

  // Absence & Break Audit Log from Ledger (tracks all breaks, including short 2m-15m trips and policy breaches)
  const allAbsences = useMemo(() => {
    return ledgerData?.all_absences || ledgerData?.extended_absences || [];
  }, [ledgerData]);

  const filteredExtended = useMemo(() => {
    return allAbsences.filter(item => {
      if (extendedStatusFilter === 'away' && item.status !== 'Currently Away') return false;
      if (extendedStatusFilter === 'returned' && item.status !== 'Returned') return false;
      if (absencePolicyFilter === 'short' && (item.duration_minutes || 0) >= absencePolicyMinutes) return false;
      if (absencePolicyFilter === 'extended' && (item.duration_minutes || 0) < absencePolicyMinutes) return false;

      // Duration filter evaluation
      const dur = item.duration_minutes || 0;
      if (absenceDurationFilter === 'lt30' && dur >= 30) return false;
      if (absenceDurationFilter === '30to60' && (dur < 30 || dur > 60)) return false;
      if (absenceDurationFilter === 'gt60' && dur <= 60) return false;
      if (absenceDurationFilter === 'gt120' && dur <= 120) return false;
      if (absenceDurationFilter === 'gt180' && dur <= 180) return false;
      if (absenceDurationFilter === 'custom') {
        if (customDurationOp === 'gt' && dur <= customDurationMins) return false;
        if (customDurationOp === 'gte' && dur < customDurationMins) return false;
        if (customDurationOp === 'lt' && dur >= customDurationMins) return false;
      }

      if (deptFilter !== 'all' && (item.department || 'General Staff') !== deptFilter) return false;
      if (extendedSearch.trim()) {
        const q = extendedSearch.toLowerCase();
        const id = (item.employee_id || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const dept = (item.department || '').toLowerCase();
        if (!id.includes(q) && !name.includes(q) && !dept.includes(q)) return false;
      }
      return true;
    });
  }, [allAbsences, extendedStatusFilter, absencePolicyFilter, absenceDurationFilter, customDurationMins, customDurationOp, absencePolicyMinutes, deptFilter, extendedSearch]);

  const extendedStats = useMemo(() => {
    const total = allAbsences.length;
    const away = allAbsences.filter(b => b.status === 'Currently Away').length;
    const returned = allAbsences.filter(b => b.status === 'Returned').length;
    const shortBreaks = allAbsences.filter(b => (b.duration_minutes || 0) < absencePolicyMinutes).length;
    const breaches = allAbsences.filter(b => (b.duration_minutes || 0) >= absencePolicyMinutes).length;
    let maxOverstay = 0;
    allAbsences.forEach(b => {
      const overstay = Math.max(0, (b.duration_minutes || 0) - absencePolicyMinutes);
      if (overstay > maxOverstay) maxOverstay = overstay;
    });
    const maxOverstayStr = maxOverstay > 0 ? (maxOverstay >= 60 ? `${Math.floor(maxOverstay / 60)}h ${maxOverstay % 60}m` : `${maxOverstay}m`) : '0m';
    return { total, away, returned, shortBreaks, breaches, maxOverstay, maxOverstayStr };
  }, [allAbsences, absencePolicyMinutes]);

  // Regular sorted visitors for 'details' tab
  const sortedVisitors = useMemo(() => {
    return [...allVisitorsWithWatchlist].sort((a, b) => {
      if (sortBy === 'latest_seen') {
        const at = a.last_seen || a.started_at || a.today_check_in || '';
        const bt = b.last_seen || b.started_at || b.today_check_in || '';
        return bt.localeCompare(at);
      }
      if (sortBy === 'check_in') {
        const at = a.today_check_in || '';
        const bt = b.today_check_in || '';
        return bt.localeCompare(at);
      }
      if (sortBy === 'emp_id') {
        const aid = (a.id || '').toLowerCase();
        const bid = (b.id || '').toLowerCase();
        return aid.localeCompare(bid, undefined, { numeric: true, sensitivity: 'base' });
      }
      // 'enrolled_first'
      const ae = a.is_enrolled ? 1 : 0, be = b.is_enrolled ? 1 : 0;
      if (ae !== be) return be - ae;
      const at = a.last_seen || a.today_check_in || '';
      const bt = b.last_seen || b.today_check_in || '';
      return bt.localeCompare(at);
    });
  }, [allVisitorsWithWatchlist, sortBy]);

  const filtered = useMemo(() => {
    return sortedVisitors.filter(v => {
      const isEnrolled = Boolean(v.is_enrolled);
      const isCheckedOut = Boolean(v.today_check_in && (v.today_status === 'CHECKED OUT' || v.is_checkout_verified));
      const isOnDuty = Boolean(v.today_check_in && !isCheckedOut);
      const isBlk = Boolean(v.is_blacklisted || watchlistIds.has(String(v.id).toLowerCase()));
      if (v.today_status === 'NOT SEEN TODAY' && statusFilter !== 'blacklisted' && !search.trim()) return false;
      if (activeSection === 'auto_enroll' && isEnrolled) return false;
      if (statusFilter === 'blacklisted' && !isBlk) return false;
      if (statusFilter === 'enrolled' && !isEnrolled) return false;
      if (statusFilter === 'auto' && isEnrolled) return false;
      if (statusFilter === 'in_hospital' && !isOnDuty) return false;
      if (statusFilter === 'checked_out' && !isCheckedOut) return false;
      if (deptFilter !== 'all' && (v.department || 'General Staff') !== deptFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const id = (v.id || '').toLowerCase();
        const name = (v.name || v.display_name || '').toLowerCase();
        const dept = (v.department || '').toLowerCase();
        const desig = (v.designation || '').toLowerCase();
        if (!id.includes(q) && !name.includes(q) && !dept.includes(q) && !desig.includes(q)) return false;
      }
      return true;
    });
  }, [sortedVisitors, search, statusFilter, deptFilter, activeSection, watchlistIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, deptFilter, statusFilter, activeSection, absentFilter]);

  const deptCounts = useMemo(() => {
    const c = {};
    visitors.forEach(v => {
      const d = v.department || 'General Staff';
      c[d] = (c[d] || 0) + 1;
    });
    return c;
  }, [visitors]);

  const startEdit = (v, e) => {
    if (e) e.stopPropagation();
    setEditingId(v.id);
    setEditForm({ name: v.name || v.display_name || '', department: v.department || 'General Staff', designation: v.designation || 'Staff Member' });
  };

  const cancelEdit = (e) => {
    if (e) e.stopPropagation();
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (empId, e) => {
    if (e) e.stopPropagation();
    setSaving(true);
    try {
      const res = await fetch('/api/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: empId, name: editForm.name || undefined, department: editForm.department, designation: editForm.designation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showNotice(`✓ ${empId} updated successfully`);
      setEditingId(null);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(err.message || 'Error saving', false);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const empId = addForm.employee_id.trim();
    const empName = addForm.name.trim() || empId; // Defaults to employee ID if blank

    if (facePhotos.length > 0 && facePhotos.length < 2) {
      alert("Please upload at least 2 face images (up to 6) showing different angles (Frontal, Left tilt, Right tilt) for high biometric recognition accuracy.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/employees/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: empName || undefined,
          employee_id: empId || undefined,
          department: addForm.department,
          designation: addForm.designation,
          photo_b64: facePhotos[0] || undefined,
          photos_b64: facePhotos.length > 0 ? facePhotos : undefined,
          org_id: activeOrgId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enroll failed');
      const assignedName = data.employee?.name || data.employee?.id || empName;
      showNotice(`✓ Added & enrolled profile ${assignedName} with ${facePhotos.length || 1} angle biometric vector(s)`);
      setAddForm({ name: '', department: 'General Staff', designation: 'Staff Member', employee_id: '' });
      clearPhotos();
      setAddOpen(false);
      setSortBy('latest_seen');
      setStatusFilter('all');
      setPage(1);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      showNotice(err.message || 'Error adding employee', false);
    } finally {
      setAdding(false);
    }
  };

  // Summary stats for Absent Staff
  const absentStats = useMemo(() => {
    const total = absentStaff.length;
    const over30 = absentStaff.filter(s => s.live_missing_mins >= 30).length;
    const over60 = absentStaff.filter(s => s.live_missing_mins >= 60).length;
    const avgMins = total > 0 ? Math.round(absentStaff.reduce((acc, s) => acc + s.live_missing_mins, 0) / total) : 0;
    const avgStr = avgMins >= 60 ? `${Math.floor(avgMins / 60)}h ${avgMins % 60}m` : `${avgMins}m`;
    const longest = absentStaff[0]?.live_missing_str || '0m';
    return { total, over30, over60, avgStr, longest };
  }, [absentStaff]);

  return (
    <div
      id="employee-registry-section"
      style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '24px', overflow: 'hidden' }}
    >

      {/* Top Navigation Tabs Header (Styled exactly like reference dashboard) */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', backgroundColor: '#fafbfc' }}>
        
        {/* Left Tabs: Employee Details | Absent from Premises | Auto-Enrolled Profiles | Security Watchlist */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
          {/* Tab 1: Employee Details */}
          <button
            onClick={() => { switchSection('details'); setStatusFilter('all'); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: activeSection === 'details' ? '#0284c7' : 'transparent',
              color: activeSection === 'details' ? '#ffffff' : '#64748b',
              boxShadow: activeSection === 'details' ? '0 2px 4px rgba(2, 132, 199, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Employee Details
          </button>

          {/* Tab 1.5: Attendance & Shift Ledger */}
          <button
            onClick={() => { switchSection('ledger'); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: activeSection === 'ledger' ? '#0f766e' : 'transparent',
              color: activeSection === 'ledger' ? '#ffffff' : '#64748b',
              boxShadow: activeSection === 'ledger' ? '0 2px 4px rgba(15, 118, 110, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Attendance & Shift Ledger
            <span style={{
              padding: '1px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '800',
              backgroundColor: activeSection === 'ledger' ? '#ffffff' : '#ccfbf1',
              color: activeSection === 'ledger' ? '#0f766e' : '#0f766e',
              boxShadow: activeSection === 'ledger' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
            }}>
              {ledgerData?.employees?.length ?? visitors.length}
            </span>
          </button>

          {/* Tab 2: Absent from Premises */}
          <button
            onClick={() => switchSection('absent')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: activeSection === 'absent' ? '#dc2626' : 'transparent',
              color: activeSection === 'absent' ? '#ffffff' : '#64748b',
              boxShadow: activeSection === 'absent' ? '0 2px 4px rgba(220, 38, 38, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            Absent from Premises
            <span style={{
              padding: '1px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '800',
              backgroundColor: activeSection === 'absent' ? '#ffffff' : '#fee2e2',
              color: activeSection === 'absent' ? '#dc2626' : '#991b1b',
              boxShadow: activeSection === 'absent' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
            }}>
              {absentStaff.length}
            </span>
          </button>

          {/* Tab 3: Auto-Enrolled Profiles */}
          <button
            onClick={() => { switchSection('auto_enroll'); setStatusFilter('auto'); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: activeSection === 'auto_enroll' ? '#d97706' : 'transparent',
              color: activeSection === 'auto_enroll' ? '#ffffff' : '#64748b',
              boxShadow: activeSection === 'auto_enroll' ? '0 2px 4px rgba(217, 119, 6, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Auto-Enrolled Profiles
            <span style={{
              padding: '1px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '800',
              backgroundColor: activeSection === 'auto_enroll' ? '#ffffff' : '#fef3c7',
              color: activeSection === 'auto_enroll' ? '#d97706' : '#92400e',
              boxShadow: activeSection === 'auto_enroll' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
            }}>
              {autoEnrolledStaff.length}
            </span>
          </button>

          {/* Tab 4: Security Watchlist */}
          <button
            onClick={() => switchSection('watchlist')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: activeSection === 'watchlist' ? '#be123c' : 'transparent',
              color: activeSection === 'watchlist' ? '#ffffff' : '#64748b',
              boxShadow: activeSection === 'watchlist' ? '0 2px 4px rgba(190, 18, 60, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Security Watchlist
            <span style={{
              padding: '1px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '800',
              backgroundColor: activeSection === 'watchlist' ? '#ffffff' : '#ffe4e6',
              color: activeSection === 'watchlist' ? '#be123c' : '#9f1239',
              boxShadow: activeSection === 'watchlist' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
            }}>
              {combinedWatchlist.length}
            </span>
          </button>

          {/* Tab 5: Zone Intrusion */}
          <button
            onClick={() => switchSection('zone_intrusion')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: activeSection === 'zone_intrusion' ? '#991b1b' : 'transparent',
              color: activeSection === 'zone_intrusion' ? '#ffffff' : '#64748b',
              boxShadow: activeSection === 'zone_intrusion' ? '0 2px 4px rgba(153, 27, 27, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            Zone Intrusion
            <span style={{
              padding: '1px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '800',
              backgroundColor: activeSection === 'zone_intrusion' ? '#ffffff' : '#fee2e2',
              color: activeSection === 'zone_intrusion' ? '#991b1b' : '#991b1b',
              boxShadow: activeSection === 'zone_intrusion' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
            }}>
              {zoneIntrusions.length}
            </span>
          </button>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {notice && (
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', backgroundColor: notice.ok ? '#dcfce7' : '#fee2e2', color: notice.ok ? '#15803d' : '#dc2626' }}>
              {notice.msg}
            </span>
          )}

          {/* Auto-Enrollment Stop/Resume Control Button */}
          {onToggleAutoEnroll && (
            <button
              type="button"
              onClick={onToggleAutoEnroll}
              title={autoEnrollEnabled ? "Auto-Enrollment is Active. Click to Stop creating new profiles." : "Auto-Enrollment is Stopped. Only existing profiles are checked. Click to Resume."}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                borderRadius: '8px',
                backgroundColor: autoEnrollEnabled ? '#ecfdf5' : '#fef2f2',
                border: `1.5px solid ${autoEnrollEnabled ? '#10b981' : '#ef4444'}`,
                color: autoEnrollEnabled ? '#065f46' : '#991b1b',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: autoEnrollEnabled ? '#10b981' : '#ef4444',
                boxShadow: `0 0 6px ${autoEnrollEnabled ? '#10b981' : '#ef4444'}`
              }}></span>
              <span>{autoEnrollEnabled ? '⚡ Auto-Enroll: ACTIVE' : '⏸️ Auto-Enroll: STOPPED'}</span>
              <span style={{ fontSize: '11px', opacity: 0.85, fontWeight: '600' }}>
                {autoEnrollEnabled ? '(Click to Stop)' : '(Existing Only)'}
              </span>
            </button>
          )}

          {/* Shift End Bulk Check-Out Button */}
          <button
            type="button"
            onClick={() => {
              const onDuty = (ledgerData?.employees || []).filter(e => e.status === 'On Duty').map(e => e.employee_id);
              setBulkSelectedIds(new Set(onDuty));
              setBulkOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: '#ea580c',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              transition: 'all 0.15s ease'
            }}
            title="Perform bulk departure check-out for shifts ending at 5:00 PM or custom time"
          >
            <span>🚪</span>
            <span>Shift End Bulk Check-Out</span>
          </button>

          {/* Action button based on active section */}
          {activeSection === 'watchlist' ? (
            <button
              onClick={() => setAddWatchlistOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', backgroundColor: '#be123c', color: '#fff', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(190,18,60,0.2)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add to Watchlist
            </button>
          ) : activeSection !== 'absent' ? (
            <button
              onClick={() => setAddOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', backgroundColor: '#0284c7', color: '#fff', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Employee
            </button>
          ) : null}
        </div>
      </div>

      {/* Warning Banner when Auto-Enrollment is Stopped */}
      {!autoEnrollEnabled && (
        <div style={{
          margin: '12px 20px 0 20px',
          padding: '10px 16px',
          borderRadius: '10px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          color: '#92400e',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⏸️</span>
            <div>
              <strong>Auto-Enrollment is STOPPED:</strong> Cameras will not generate new auto-enrolled profiles for unrecognized faces. All {autoEnrolledStaff.length} existing auto-enrolled and registered profiles are being checked and tracked.
            </div>
          </div>
          {onToggleAutoEnroll && (
            <button
              type="button"
              onClick={onToggleAutoEnroll}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: '#d97706',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Resume Auto-Enroll
            </button>
          )}
        </div>
      )}

      {/* Add Employee Form with Face Photo Upload */}
      {addOpen && activeSection !== 'absent' && (
        <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '170px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Name (defaults to ID if blank)</label>
                <input
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Defaults to ID"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '170px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Employee ID</label>
                <input
                  value={addForm.employee_id}
                  onChange={e => setAddForm(p => ({ ...p, employee_id: e.target.value }))}
                  placeholder="Auto-assigned (or enter ID)"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '180px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Department</label>
                <select value={addForm.department} onChange={e => setAddForm(p => ({ ...p, department: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Role</label>
                <select value={addForm.designation} onChange={e => setAddForm(p => ({ ...p, designation: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Face Photos Multi-Angle Upload (Min 2, Max 6) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: '#1e293b' }}>
                    Multi-Angle Face Biometrics (Min 2, Max 6 Angle Captures)
                  </label>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: facePhotos.length === 0 ? '#64748b' : (facePhotos.length < 2 ? '#b45309' : '#059669')
                  }}>
                    {facePhotos.length === 0 && '0/6 angles (Upload at least 2: Frontal, Left tilt, Right tilt)'}
                    {facePhotos.length === 1 && '⚠️ 1/6 uploaded — Please add at least 1 more angle (Min 2 required)'}
                    {facePhotos.length >= 2 && `✓ ${facePhotos.length}/6 angle biometric vectors ready`}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    id="face-photo-input"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="face-photo-input"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '7px',
                      border: '1.5px dashed #0284c7',
                      backgroundColor: '#f0f9ff',
                      color: '#0284c7',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: facePhotos.length >= 6 ? 'not-allowed' : 'pointer',
                      opacity: facePhotos.length >= 6 ? 0.6 : 1
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    {facePhotos.length === 0 ? '+ Upload Angle Photos (Min 2, Max 6)' : `+ Add More Angles (${facePhotos.length}/6)`}
                  </label>

                  {facePhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={clearPhotos}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#fff',
                        fontSize: '11px',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontWeight: '600'
                      }}
                    >
                      Clear All
                    </button>
                  )}

                  {/* Angle Previews Grid */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {facePhotos.map((photo, idx) => {
                      const angleLabels = ['Frontal', 'Left Tilt', 'Right Tilt', 'Slight Up', 'Slight Down', 'Side View'];
                      const label = angleLabels[idx] || `Angle #${idx + 1}`;
                      return (
                        <div
                          key={idx}
                          style={{
                            position: 'relative',
                            width: '54px',
                            height: '54px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: idx === 0 ? '2px solid #0284c7' : '1px solid #cbd5e1',
                            backgroundColor: '#000',
                            flexShrink: 0,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                        >
                          <img
                            src={photo}
                            alt={label}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: 'rgba(15, 23, 42, 0.75)',
                            color: '#fff',
                            fontSize: '8px',
                            fontWeight: '700',
                            textAlign: 'center',
                            padding: '1px 0',
                            lineHeight: 1.1
                          }}>
                            {label}
                          </div>
                          <button
                            type="button"
                            onClick={() => removePhotoAt(idx)}
                            title="Remove this angle"
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                              background: 'rgba(239, 68, 68, 0.9)',
                              color: '#fff',
                              border: 'none',
                              fontSize: '9px',
                              cursor: 'pointer',
                              padding: '1px 4px',
                              lineHeight: 1,
                              borderRadius: '0 0 0 4px',
                              fontWeight: '900'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={adding}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '6px', backgroundColor: '#059669', color: '#fff', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {adding ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => { setAddOpen(false); clearPhotos(); setAddForm({ name: '', department: 'General Staff', designation: 'Staff Member', employee_id: '' }); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '12px', cursor: 'pointer', color: '#64748b' }}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Add to Security Watchlist Form / Modal */}
      {addWatchlistOpen && (
        <div style={{ padding: '16px 20px', backgroundColor: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
          <form onSubmit={handleAddWatchlist} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🚨</span>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#9f1239' }}>
                  Add Person to Security Watchlist & Threat Registry
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setAddWatchlistOpen(false); setWatchlistPhotoPreview(null); }}
                style={{ background: 'transparent', border: 'none', color: '#9f1239', fontWeight: '800', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Target ID / Employee ID</label>
                <input
                  value={watchlistForm.id}
                  onChange={e => setWatchlistForm(p => ({ ...p, id: e.target.value }))}
                  placeholder="e.g. EMP-23 (or auto-ID)"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '180px', backgroundColor: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Person Name / Alias</label>
                <input
                  value={watchlistForm.name}
                  onChange={e => setWatchlistForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Target EMP-23 or Name"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '190px', backgroundColor: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Blacklist Reason / Alert Type</label>
                <select
                  value={watchlistForm.reasonPreset}
                  onChange={e => setWatchlistForm(p => ({ ...p, reasonPreset: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="Security Screening Required">Security Screening Required</option>
                  <option value="Banned from Premises / Restricted Access">Banned from Premises / Restricted Access</option>
                  <option value="Disciplinary Suspension">Disciplinary Suspension</option>
                  <option value="VIP / High-Risk Alert">VIP / High-Risk Alert</option>
                  <option value="Flagged via Live HUD Click">Flagged via Live HUD Click</option>
                  <option value="Custom">Custom Reason...</option>
                </select>
              </div>

              {watchlistForm.reasonPreset === 'Custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Specify Reason</label>
                  <input
                    value={watchlistForm.reasonCustom}
                    onChange={e => setWatchlistForm(p => ({ ...p, reasonCustom: e.target.value }))}
                    placeholder="Enter reason..."
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '180px', backgroundColor: '#fff' }}
                  />
                </div>
              )}

              {/* Photo Upload for Watchlist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Reference Photo (Optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="file"
                    id="watchlist-photo-input"
                    accept="image/*"
                    onChange={handleWatchlistPhotoSelect}
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="watchlist-photo-input"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #be123c',
                      backgroundColor: '#fff',
                      color: '#be123c',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    {watchlistPhotoPreview ? 'Change Photo' : 'Upload Photo'}
                  </label>
                  {watchlistPhotoPreview && (
                    <div style={{ position: 'relative', width: '32px', height: '32px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #be123c' }}>
                      <img src={watchlistPhotoPreview} alt="Watchlist preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => { setWatchlistPhotoPreview(null); setWatchlistForm(p => ({ ...p, photoB64: null })); }}
                        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: '9px', cursor: 'pointer', padding: '1px 3px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={savingWatchlist}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '6px', backgroundColor: '#be123c', color: '#fff', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                >
                  {savingWatchlist ? 'Adding...' : '🚨 Add to Watchlist'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddWatchlistOpen(false); setWatchlistPhotoPreview(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '12px', cursor: 'pointer', color: '#64748b' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 1 & 3: REGULAR EMPLOYEE DETAILS & AUTO-ENROLLED PROFILES */}
      {(activeSection === 'details' || activeSection === 'auto_enroll') && (
        <>
          {/* Banner for Auto-Enrolled Section */}
          {activeSection === 'auto_enroll' && (
            <div style={{ padding: '12px 20px', backgroundColor: '#fffbeb', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}>
                    Auto-Enrolled Visitor Profiles ({autoEnrolledStaff.length} Detected)
                  </div>
                  <div style={{ fontSize: '12px', color: '#b45309' }}>
                    {autoEnrollEnabled
                      ? "Auto-enrollment is currently active. If you are getting flooded with new profiles, click 'Stop Auto-Enroll' above to freeze new creation and check only these existing profiles."
                      : "Auto-enrollment is STOPPED. All camera detections will only match and check these existing profiles."}
                  </div>
                </div>
              </div>
              {onToggleAutoEnroll && (
                <button
                  type="button"
                  onClick={onToggleAutoEnroll}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '7px',
                    backgroundColor: autoEnrollEnabled ? '#dc2626' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {autoEnrollEnabled ? '⏸️ Stop Auto-Enrollment' : '▶️ Resume Auto-Enrollment'}
                </button>
              )}
            </div>
          )}

          {/* Filter Bar */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#fafbfc' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ID, name, dept..."
                style={{ paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#0f172a', outline: 'none', width: '200px' }}
              />
            </div>

            {/* Status Filter Pills */}
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px', flexWrap: 'wrap' }}>
              {[
                ['all', `All (${activeSection === 'auto_enroll' ? autoEnrolledStaff.length : visitors.length})`],
                ['enrolled', `Enrolled (${enrolledStaffCount})`],
                ['auto', `Auto ID (${autoEnrolledStaff.length})`],
                ['in_hospital', 'On Duty'],
                ['checked_out', 'Checked Out'],
                ['blacklisted', `🚨 Blacklisted (${blacklistedStaffCount})`]
              ].map(([id, label]) => (
                <button key={id} onClick={() => setStatusFilter(id)}
                  style={{ padding: '3px 10px', borderRadius: '5px', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                    backgroundColor: statusFilter === id ? (id === 'blacklisted' ? '#fee2e2' : '#ffffff') : 'transparent',
                    color: statusFilter === id ? (id === 'blacklisted' ? '#dc2626' : '#0284c7') : '#64748b',
                    boxShadow: statusFilter === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Department Dropdown */}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' }}>
              <option value="all">All Departments</option>
              {Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([d, c]) => (
                <option key={d} value={d}>{d} ({c})</option>
              ))}
            </select>

            {/* Sort By Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>Sort:</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#0369a1', fontWeight: '700', outline: 'none', cursor: 'pointer' }}>
                <option value="latest_seen">⚡ Latest Detection (Real-Time)</option>
                <option value="check_in">🟢 Today Check-In Time</option>
                <option value="enrolled_first">✓ Enrolled Staff First</option>
                <option value="emp_id">🔢 Employee ID</option>
              </select>
            </div>

            {(activeSection === 'auto_enroll' || statusFilter === 'auto') && autoEnrolledStaff.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllAutoEnrolled}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #fda4af',
                  backgroundColor: '#fff1f2',
                  color: '#e11d48',
                  fontSize: '11px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 1px 2px rgba(225, 29, 72, 0.1)',
                  transition: 'all 0.15s ease'
                }}
                title="Delete all auto-enrolled profiles"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete All Auto-IDs ({autoEnrolledStaff.length})
              </button>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isLoading && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#0369a1'
                }}>
                  <LoadingSpinner size={11} color="#0284c7" />
                  <span>Loading...</span>
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>
                {filtered.length} employees · Page {page}/{totalPages}
              </span>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', position: 'relative', minHeight: isLoading ? '200px' : undefined }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Employee ID', 'Name / Status', 'Department', 'Role', 'Today In', 'Last Sighting', 'Today Out', 'Duty Hours', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '800', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && visitors.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: '44px 20px', textAlign: 'center' }}>
                      <LoadingSpinner
                        size={30}
                        layout="stacked"
                        label="Loading employee records from database..."
                        sublabel="Fetching biometric profiles & attendance status"
                      />
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No employees match the current filter.</td></tr>
                ) : paged.map((v, idx) => {
                  const isEnrolled = Boolean(v.is_enrolled);
                  const isCheckedOut = Boolean(v.today_check_in && (v.today_status === 'CHECKED OUT' || v.is_checkout_verified));
                  const isOnDuty = Boolean(v.today_check_in && !isCheckedOut);
                  const isNotCheckedIn = !v.today_check_in;
                  const isBlk = Boolean(v.is_blacklisted || watchlistIds.has(String(v.id).toLowerCase()));
                  const isEditing = editingId === v.id;
                  const displayName = v.name || v.display_name || v.id;
                  const inTime = v.today_check_in ? fmtTime(v.today_check_in) : '—';
                  const outTime = v.today_check_out ? fmtTime(v.today_check_out) : '—';
                  const dur = v.today_duration_str || (v.stats_30d?.today_duration) || '—';
                  const thumb = v.crops?.[0] || v.photo_b64 || null;

                  return (
                    <tr
                      key={v.id}
                      onClick={() => {
                        if (!isEditing && onSelectEmployee) {
                          onSelectEmployee(v.id);
                        }
                      }}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafbfc',
                        cursor: isEditing ? 'default' : 'pointer',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => { if (!isEditing) e.currentTarget.style.backgroundColor = isBlk ? '#fef2f2' : '#f0f9ff'; }}
                      onMouseLeave={e => { if (!isEditing) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#fafbfc'; }}
                      title="Click row to view face photo, CCTV body capture & in/out journey"
                    >
                      {/* ID */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', fontSize: '12px', color: '#0284c7' }}>{v.id}</span>
                      </td>

                      {/* Thumbnail + Name + badge */}
                      <td style={{ padding: '10px 14px', minWidth: '180px' }}>
                        {isEditing ? (
                          <input
                            value={editForm.name}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Enter name..."
                            style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #93c5fd', fontSize: '12px', width: '150px', outline: 'none' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: isBlk ? '1.5px solid #f87171' : '1px solid #cbd5e1',
                              backgroundColor: isBlk ? '#fee2e2' : '#e2e8f0',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {thumb ? (
                                <img
                                  src={thumb.startsWith('data:') ? thumb : `data:image/jpeg;base64,${thumb}`}
                                  alt={v.id}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: '800', color: isBlk ? '#dc2626' : '#64748b' }}>
                                  {displayName.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: isEnrolled ? '700' : '500', color: isEnrolled ? '#0f172a' : '#64748b' }}>
                                  {displayName}
                                </span>
                                <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px',
                                  backgroundColor: isEnrolled ? '#ecfdf5' : '#f1f5f9',
                                  color: isEnrolled ? '#059669' : '#475569',
                                  border: `1px solid ${isEnrolled ? '#a7f3d0' : '#cbd5e1'}` }}>
                                  {isEnrolled ? '✓ ENROLLED' : 'AUTO ID'}
                                </span>
                                {isBlk && (
                                  <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 6px', borderRadius: '4px',
                                    backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #f87171' }}>
                                    🚨 BLACKLISTED
                                  </span>
                                )}
                                {v.restricted_cameras && v.restricted_cameras.length > 0 && (
                                  <span
                                    title={`Prohibited Checkpoints: ${Array.isArray(v.restricted_cameras) ? v.restricted_cameras.join(', ') : v.restricted_cameras}`}
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: '800',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: '#fee2e2',
                                      color: '#991b1b',
                                      border: '1px solid #fca5a5'
                                    }}
                                  >
                                    🚫 {Array.isArray(v.restricted_cameras) ? v.restricted_cameras.length : 1} Zones Restricted
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '10px 14px' }}>
                        {isEditing ? (
                          <select
                            value={editForm.department}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditForm(p => ({ ...p, department: e.target.value }))}
                            style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #93c5fd', fontSize: '12px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}>
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : (
                          <span style={{ color: '#334155', fontWeight: '600' }}>{v.department || 'General Staff'}</span>
                        )}
                      </td>

                      {/* Role */}
                      <td style={{ padding: '10px 14px' }}>
                        {isEditing ? (
                          <select
                            value={editForm.designation}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))}
                            style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #93c5fd', fontSize: '12px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <span style={{ color: '#475569' }}>{v.designation || 'Staff Member'}</span>
                        )}
                      </td>

                      {/* Today In */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#0369a1', fontWeight: '700', whiteSpace: 'nowrap' }}>
                        {inTime}
                      </td>

                      {/* Last Sighting */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {v.last_seen ? (
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#0f172a', fontWeight: '700' }}>
                              {fmtTime(v.last_seen)}
                            </div>
                            <div style={{ fontSize: '10px', color: '#0284c7', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                              <span>📍</span>
                              <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {v.last_camera_name || v.camera_name || 'Checkpoint'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#94a3b8' }}>—</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Not detected yet</div>
                          </div>
                        )}
                      </td>

                      {/* Today Out */}
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', whiteSpace: 'nowrap',
                        color: isCheckedOut ? '#dc2626' : (v.today_check_out ? '#0369a1' : '#94a3b8'),
                        fontWeight: (isCheckedOut || v.today_check_out) ? '700' : 'normal' }}>
                        {outTime}
                      </td>

                      {/* Duty Hours */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>
                          {v.working_str || dur}
                        </div>
                        {v.today_check_in && (
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                            <span>☕ {v.break_str || '0m'}</span>
                            <span style={{ margin: '0 4px', color: '#cbd5e1' }}>•</span>
                            <span style={{ fontWeight: '700', color: ((v.productivity_pct ?? 100) >= 85 ? '#059669' : ((v.productivity_pct ?? 100) >= 70 ? '#d97706' : '#dc2626')) }}>
                              ⚡ {v.productivity_pct != null ? `${v.productivity_pct}%` : '100%'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={(e) => saveEdit(v.id, e)}
                              disabled={saving}
                              style={{ padding: '3px 8px', borderRadius: '5px', backgroundColor: '#059669', color: '#fff', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                              {saving ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{ padding: '3px 7px', borderRadius: '5px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: '11px', cursor: 'pointer', color: '#475569' }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px',
                              backgroundColor: isNotCheckedIn ? '#f8fafc' : (isCheckedOut ? '#f1f5f9' : '#ecfdf5'),
                              color: isNotCheckedIn ? '#94a3b8' : (isCheckedOut ? '#64748b' : '#059669'),
                              border: isNotCheckedIn ? '1px solid #e2e8f0' : 'none' }}>
                              {isNotCheckedIn ? '— NOT IN PREMISES' : (isCheckedOut ? '✓ OUT' : '● ON DUTY')}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSingleOverride(v, (!v.today_check_in || isCheckedOut) ? 'check_in' : 'check_out');
                              }}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: '700',
                                borderRadius: '5px',
                                border: 'none',
                                backgroundColor: (!v.today_check_in || isCheckedOut) ? '#059669' : '#ea580c',
                                color: '#fff',
                                cursor: 'pointer'
                              }}
                              title={!v.today_check_in ? "Manual Check-In" : (isCheckedOut ? "Manual Check-In back on duty" : "Manual Check-Out")}
                            >
                              {(!v.today_check_in || isCheckedOut) ? '🟢 In' : '🚪 Out'}
                            </button>
                            {isBlk ? (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Remove ${displayName} (${v.id}) from security watchlist?`)) {
                                    if (onRemoveBlacklist) await onRemoveBlacklist(v.id);
                                    showNotice(`✓ Unflagged ${displayName}`);
                                    if (onDataRefresh) onDataRefresh();
                                  }
                                }}
                                style={{ padding: '3px 8px', borderRadius: '5px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', fontSize: '11px', cursor: 'pointer', color: '#dc2626', fontWeight: '700' }}
                                title="Remove from security watchlist"
                              >
                                Unflag
                              </button>
                            ) : (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const reason = window.prompt(`Enter reason for blacklisting ${displayName}:`, "Security screening required");
                                  if (reason) {
                                    if (onBlacklist) await onBlacklist(v.id, displayName, reason);
                                    showNotice(`✓ Added ${displayName} to watchlist`);
                                    if (onDataRefresh) onDataRefresh();
                                  }
                                }}
                                style={{ padding: '3px 8px', borderRadius: '5px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '11px', cursor: 'pointer', color: '#64748b', fontWeight: '600' }}
                                title="Add to security watchlist"
                              >
                                Flag
                              </button>
                            )}
                            <button
                              onClick={(e) => openEditModal(v, e)}
                              style={{ padding: '3px 8px', borderRadius: '5px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '11px', cursor: 'pointer', color: '#475569', fontWeight: '600' }}
                              title="Edit profile & designate restricted zone cameras"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectEmployee) onSelectEmployee(v.id);
                              }}
                              style={{ padding: '3px 8px', borderRadius: '5px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', fontSize: '11px', cursor: 'pointer', color: '#0284c7', fontWeight: '700' }}
                              title="View photos & in/out history"
                            >
                              View ➔
                            </button>
                            <button
                              onClick={(e) => handleDeleteEmployee(v.id, displayName, e)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '5px',
                                backgroundColor: '#fff1f2',
                                border: '1px solid #fecdd3',
                                fontSize: '11px',
                                cursor: 'pointer',
                                color: '#e11d48',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Permanently delete profile and attendance records"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <LoadingOverlay
              visible={isLoading && visitors.length > 0}
              spinnerSize={28}
              message="Refreshing employee records..."
              subtext="Fetching latest data from database"
            />
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafbfc' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ padding: '4px 10px', borderRadius: '5px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '11px', fontWeight: '600', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, color: '#334155' }}>
                  ← Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      style={{ width: '28px', height: '28px', borderRadius: '5px', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                        backgroundColor: page === p ? '#0284c7' : '#fff',
                        color: page === p ? '#fff' : '#475569',
                        boxShadow: page === p ? '0 1px 2px rgba(2,132,199,0.3)' : 'none' }}>
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>...</span>}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{ padding: '4px 10px', borderRadius: '5px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '11px', fontWeight: '600', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, color: '#334155' }}>
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* VIEW 1.5: ATTENDANCE & SHIFT LEDGER (DAILY WORK, BREAK & PRODUCTIVITY) */}
      {activeSection === 'ledger' && (
        <div>
          {/* Executive Shift Summary Header Banner */}
          <div style={{
            padding: '16px 20px',
            backgroundColor: '#f0fdfa',
            borderBottom: '1px solid #ccfbf1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#0f766e',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: '0 4px 6px -1px rgba(15, 118, 110, 0.25)'
              }}>
                📋
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#134e4a' }}>
                  Daily Attendance & Shift Movement Ledger
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#0f766e' }}>
                  Full shift audit for <strong>{ledgerDate}</strong>: First In, Final Out, Working vs Break Intervals, and Biometric Productivity.
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #99f6e4', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f766e' }}>{ledgerData?.summary?.total_staff ?? ledgerData?.employees?.length ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Total Staff</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #bbf7d0', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#15803d' }}>{ledgerData?.summary?.on_duty_count ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>On Duty</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #fed7aa', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c' }}>{ledgerData?.summary?.checked_out_count ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Completed</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#64748b' }}>{ledgerData?.summary?.absent_count ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Absent</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #fde68a', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#b45309' }}>{ledgerData?.summary?.early_checkin_count ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#b45309', textTransform: 'uppercase' }}>⚡ Early In</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #fed7aa', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c' }}>{ledgerData?.summary?.late_arrivals_count ?? ledgerData?.employees?.filter(e => e.is_late_arrival).length ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#c2410c', textTransform: 'uppercase' }}>⚠️ Late In</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #fca5a5', minWidth: '70px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#991b1b' }}>{ledgerData?.summary?.late_night_exit_count ?? 0}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#991b1b', textTransform: 'uppercase' }}>🌙 Late Exit</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 14px', backgroundColor: '#0f766e', borderRadius: '8px', color: '#ffffff', minWidth: '85px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800' }}>{ledgerData?.summary?.avg_working_str ?? '0h 00m'}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', opacity: 0.9, textTransform: 'uppercase' }}>Avg Working</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 14px', backgroundColor: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa', minWidth: '80px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c' }}>{ledgerData?.summary?.avg_break_str ?? '0h 00m'}</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#9a3412', textTransform: 'uppercase' }}>Avg Break</div>
              </div>
              <div style={{ textAlign: 'center', padding: '6px 14px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', minWidth: '80px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#16a34a' }}>{ledgerData?.summary?.avg_productivity_pct ?? 0}%</div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase' }}>Productivity</div>
              </div>
            </div>
          </div>

          {/* Ledger Control Bar: Date, Search, Filters, Bulk Action */}
          <div style={{
            padding: '12px 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Date Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f8fafc', padding: '4px 8px', borderRadius: '8px', border: ledgerLoading ? '1px solid #14b8a6' : '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#475569' }}>📅 Shift Date:</span>
                <input
                  type="date"
                  value={ledgerDate}
                  onChange={(e) => setLedgerDate(e.target.value)}
                  style={{
                    padding: '3px 6px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#fff',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
                {ledgerLoading && (
                  <LoadingSpinner size={13} color="#0f766e" trackColor="rgba(15, 118, 110, 0.2)" />
                )}
              </div>

              {/* Status Filters */}
              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                {[
                  ['all', `All (${ledgerData?.employees?.length ?? 0})`],
                  ['enrolled', `Enrolled (${ledgerEnrolledCount})`],
                  ['auto', `Auto ID (${ledgerAutoCount})`],
                  ['on_duty', `🟢 On Duty (${ledgerData?.summary?.on_duty_count ?? 0})`],
                  ['checked_out', `✓ Checked Out (${ledgerData?.summary?.checked_out_count ?? 0})`],
                  ['absent', `⚪ Absent (${ledgerData?.summary?.absent_count ?? 0})`],
                  ['early', `⚡ Early In (${ledgerData?.employees?.filter(e => e.is_early_checkin).length ?? 0})`],
                  ['late_in', `⚠️ Late In (${ledgerData?.summary?.late_arrivals_count ?? ledgerData?.employees?.filter(e => e.is_late_arrival).length ?? 0})`],
                  ['late_exit', `🌙 Late Night (${ledgerData?.employees?.filter(e => e.is_late_night_exit).length ?? 0})`]
                ].map(([sid, slabel]) => (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => setLedgerStatusFilter(sid)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      backgroundColor: ledgerStatusFilter === sid ? '#ffffff' : 'transparent',
                      color: ledgerStatusFilter === sid ? '#0f766e' : '#64748b',
                      boxShadow: ledgerStatusFilter === sid ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                    }}
                  >
                    {slabel}
                  </button>
                ))}
              </div>

              {/* Department Filter */}
              <select
                value={ledgerDeptFilter}
                onChange={(e) => setLedgerDeptFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  backgroundColor: '#fff',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search staff name, ID..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  style={{
                    padding: '5px 10px 5px 28px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    width: '180px',
                    outline: 'none'
                  }}
                />
                <span style={{ position: 'absolute', left: '8px', top: '5px', fontSize: '12px', color: '#94a3b8' }}>🔍</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => fetchLedger(false)}
                disabled={ledgerSyncing || ledgerLoading}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: (ledgerSyncing || ledgerLoading) ? '#f0fdfa' : '#ffffff',
                  color: (ledgerSyncing || ledgerLoading) ? '#0f766e' : '#475569',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: (ledgerSyncing || ledgerLoading) ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
                title="Refresh attendance ledger from database"
              >
                {(ledgerSyncing || ledgerLoading) ? (
                  <LoadingSpinner size={13} color="#0f766e" trackColor="rgba(15, 118, 110, 0.2)" />
                ) : (
                  <span>🔄</span>
                )}
                <span>{(ledgerSyncing || ledgerLoading) ? 'Loading...' : 'Refresh'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const onDuty = (ledgerData?.employees || []).filter(e => e.status === 'On Duty').map(e => e.employee_id);
                  setBulkSelectedIds(new Set(onDuty));
                  setBulkDate(ledgerDate);
                  setBulkOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '7px',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(234, 88, 12, 0.2)'
                }}
              >
                <span>🚪</span>
                <span>Shift End Bulk Check-Out</span>
              </button>
            </div>
          </div>

          {/* Ledger Table — with fixed minimum height to guarantee zero layout shifts */}
          <div style={{ overflowX: 'auto', minHeight: '300px', position: 'relative' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>First In (Entry)</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Final Out (Exit)</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Working Time</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Break Time</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Shift Span</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Productivity</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Passages</th>
                  <th style={{ padding: '10px 14px', fontWeight: '800' }}>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {(!ledgerData && ledgerLoading) ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                      <LoadingSpinner
                        size={32}
                        color="#0f766e"
                        trackColor="rgba(15, 118, 110, 0.2)"
                        layout="stacked"
                        label={`Loading shift ledger for ${ledgerDate}...`}
                        sublabel="Querying database records"
                      />
                    </td>
                  </tr>
                ) : filteredLedgerEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                      No staff attendance records found for {ledgerDate} matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredLedgerEmployees.map((emp, idx) => {
                    const prod = typeof emp.productivity_pct === 'number' ? emp.productivity_pct : 100.0;
                    const prodColor = prod >= 85 ? '#059669' : (prod >= 70 ? '#d97706' : '#dc2626');
                    const prodBg = prod >= 85 ? '#ecfdf5' : (prod >= 70 ? '#fffbeb' : '#fef2f2');
                    const isOnDuty = emp.status === 'On Duty';
                    const isCheckedOut = emp.status === 'Checked Out';
                    const isAbsent = emp.status === 'Absent';
                    const avatar = emp.photo_b64 || (emp.crops && emp.crops[0]);

                    return (
                      <tr
                        key={emp.employee_id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafbfc',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdfa'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                      >
                        {/* Employee */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              backgroundColor: '#e2e8f0',
                              border: '1px solid #cbd5e1',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {avatar ? (
                                <img
                                  src={avatar.startsWith('data:') ? avatar : `data:image/jpeg;base64,${avatar}`}
                                  alt={emp.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#0f766e' }}>
                                  {(emp.name || emp.employee_id).slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {emp.name || emp.employee_id}
                                {!emp.is_enrolled && (
                                  <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                                    AUTO ID
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#0284c7', fontWeight: '700' }}>
                                  {emp.employee_id}
                                </span>
                                <span style={{ color: '#cbd5e1' }}>•</span>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                  {emp.department}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 14px' }}>
                          {isOnDuty && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#ecfdf5',
                              color: '#047857',
                              fontWeight: '700',
                              fontSize: '11px',
                              border: '1px solid #a7f3d0'
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                              On Duty
                            </span>
                          )}
                          {isCheckedOut && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              fontWeight: '700',
                              fontSize: '11px',
                              border: '1px solid #cbd5e1'
                            }}>
                              ✓ Checked Out
                            </span>
                          )}
                          {isAbsent && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#f8fafc',
                              color: '#94a3b8',
                              fontWeight: '600',
                              fontSize: '11px',
                              border: '1px solid #e2e8f0'
                            }}>
                              ⚪ Absent
                            </span>
                          )}
                        </td>

                        {/* First In */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: emp.is_late_arrival ? '#c2410c' : '#0369a1' }}>
                            {emp.check_in_display || '—'}
                          </div>
                          {emp.is_early_checkin && (
                            <div style={{ marginTop: '2px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#fef3c7',
                                color: '#b45309',
                                fontSize: '9px',
                                fontWeight: '800',
                                border: '1px solid #fde68a'
                              }} title={`Early arrival before shift start: ${emp.early_duration_str}`}>
                                ⚡ Early (-{emp.early_duration_str})
                              </span>
                            </div>
                          )}
                          {emp.is_late_arrival && (
                            <div style={{ marginTop: '2px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#fff7ed',
                                color: '#c2410c',
                                fontSize: '9px',
                                fontWeight: '800',
                                border: '1px solid #fed7aa'
                              }} title={`Late arrival past shift start: ${emp.late_duration_str || `${emp.late_minutes}m`}`}>
                                ⚠️ Late (+{emp.late_duration_str || `${emp.late_minutes}m`})
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: '10px', marginTop: '2px' }}>
                            {emp.is_check_in_manual ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                                📝 Admin Override
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>{emp.check_in_camera_name || emp.check_in_camera || '—'}</span>
                            )}
                          </div>
                        </td>

                        {/* Final Out */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: '700',
                            color: isCheckedOut ? '#15803d' : (isOnDuty ? '#b45309' : '#94a3b8')
                          }}>
                            {isCheckedOut ? (emp.check_out_display || '—') : (isOnDuty ? '● Shift Ongoing' : '—')}
                          </div>
                          {emp.is_late_night_exit && (
                            <div style={{ marginTop: '2px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                fontSize: '9px',
                                fontWeight: '800',
                                border: '1px solid #fca5a5'
                              }} title={`Late night departure after midnight: ${emp.late_exit_time_str}`}>
                                🌙 Late Night Exit ({emp.late_exit_time_str})
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: '10px', marginTop: '2px' }}>
                            {emp.is_check_out_manual ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                                📝 Admin Override
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>
                                {isCheckedOut ? (emp.check_out_camera_name || 'Exit Gate') : (isOnDuty ? 'In Campus' : '—')}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Working Time */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13px' }}>
                            {emp.working_str || '0h 00m'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            {emp.working_minutes} mins active
                          </div>
                        </td>

                        {/* Break Time */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: '700', color: (emp.break_minutes > 60 ? '#dc2626' : '#b45309') }}>
                            {emp.break_str || '0h 00m'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                            {emp.break_count ? `${emp.break_count} passage breaks` : 'No exit breaks'}
                          </div>
                        </td>

                        {/* Shift Span */}
                        <td style={{ padding: '10px 14px', color: '#64748b', fontWeight: '600' }}>
                          {emp.shift_span_str || '—'}
                        </td>

                        {/* Productivity */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '800',
                              backgroundColor: prodBg,
                              color: prodColor,
                              border: `1px solid ${prodColor}33`
                            }}>
                              {prod}%
                            </span>
                          </div>
                          <div style={{ width: '48px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
                            <div style={{ width: `${Math.min(100, prod)}%`, height: '100%', backgroundColor: prodColor }}></div>
                          </div>
                        </td>

                        {/* Passages */}
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#f1f5f9',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            <span style={{ color: '#15803d' }}>{emp.in_count} In</span>
                            <span style={{ color: '#94a3b8' }}>/</span>
                            <span style={{ color: '#b45309' }}>{emp.out_count} Out</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isOnDuty && (
                              <button
                                type="button"
                                onClick={() => openSingleOverride(emp, 'check_out')}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: '#ea580c',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 2px rgba(234, 88, 12, 0.2)'
                                }}
                                title="Record departure check-out for this employee"
                              >
                                🚪 Check Out
                              </button>
                            )}

                            {isCheckedOut && (
                              <button
                                type="button"
                                onClick={() => openSingleOverride(emp, 'check_in')}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: '#059669',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                                title="Check-in staff member back into campus"
                              >
                                🟢 Check In
                              </button>
                            )}

                            {isAbsent && (
                              <button
                                type="button"
                                onClick={() => openSingleOverride(emp, 'check_in')}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  backgroundColor: '#ffffff',
                                  color: '#0f766e',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                                title="Manual arrival entry for absent employee"
                              >
                                + Check In
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onSelectEmployee(emp.employee_id)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #bae6fd',
                                backgroundColor: '#f0f9ff',
                                color: '#0284c7',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="Audit full CCTV movement journey"
                            >
                              🔍 Journey
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const isEarly = Boolean(emp.is_early_checkin);
                                const isLate = Boolean(emp.is_late_arrival || (emp.check_in_time && emp.assigned_shift_start && emp.check_in_time > emp.assigned_shift_start));
                                const alertType = isEarly ? 'early_checkin' : (isLate ? 'late_arrival' : 'general_alert');
                                const alertPrefix = isEarly ? '⚡ Early Check-In Notification' : (isLate ? '⏰ Late Arrival Alert' : '📋 Shift Attendance Advisory');

                                setEmailAlertModalData({
                                  alertType: alertType,
                                  subject: `${alertPrefix}: ${emp.name || emp.employee_id} (${emp.department || 'Staff'})`,
                                  title: `${alertPrefix} — Medanta Operations`,
                                  summary: isEarly
                                    ? `Staff member ${emp.name || emp.employee_id} completed inbound biometric check-in prior to scheduled shift start time.`
                                    : (isLate
                                        ? `Staff member ${emp.name || emp.employee_id} arrived past scheduled shift start time.`
                                        : `Daily shift movement and attendance record for ${emp.name || emp.employee_id}.`),
                                  metadata: {
                                    'Employee ID': emp.employee_id,
                                    'Employee Name': emp.name || emp.employee_id,
                                    'Department': emp.department || 'General Staff',
                                    'Assigned Shift': emp.assigned_shift_display || emp.shift_window || '09:00 AM - 06:00 PM',
                                    'First In (Check-In)': emp.check_in_display || '—',
                                    'Final Out (Check-Out)': emp.check_out_display || '—',
                                    'Working Time': emp.working_str || '0h 00m',
                                    'Break Time': emp.break_str || '0h 00m',
                                    'Productivity': `${prod}%`,
                                    'Shift Status': emp.status || 'Active'
                                  },
                                  faceCrop: (emp.crops && emp.crops[0]) || emp.face_crop || avatar || null,
                                  bodyCrop: emp.body_b64 || emp.photo_b64 || avatar || null
                                });
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #fed7aa',
                                backgroundColor: '#fff7ed',
                                color: '#ea580c',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Dispatch attendance email alert (Late arrival / Early check-in)"
                            >
                              ✉ Alert
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <LoadingOverlay
              visible={Boolean(ledgerData && ledgerLoading)}
              spinnerSize={30}
              color="#0f766e"
              trackColor="rgba(15, 118, 110, 0.2)"
              message={`Loading shift ledger for ${ledgerDate}...`}
              subtext="Querying database records"
            />
          </div>
        </div>
      )}

      {/* VIEW 2: ABSENT FROM PREMISES & EXTENDED ABSENCE AUDIT LOG */}
      {activeSection === 'absent' && (
        <div>
          {/* Sub-Navigation Switcher for Live Absent vs Permanent Extended Absence Log */}
          <div style={{
            padding: '12px 20px',
            backgroundColor: '#fff7ed',
            borderBottom: '1px solid #fed7aa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setAbsentSubTab('currently_away')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: absentSubTab === 'currently_away' ? '1px solid #ea580c' : '1px solid #fed7aa',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  backgroundColor: absentSubTab === 'currently_away' ? '#ea580c' : '#ffffff',
                  color: absentSubTab === 'currently_away' ? '#ffffff' : '#9a3412',
                  boxShadow: absentSubTab === 'currently_away' ? '0 2px 4px rgba(234, 88, 12, 0.25)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: absentSubTab === 'currently_away' ? '#ffffff' : '#ea580c' }} />
                🔴 Currently Away (Live Shift)
                <span style={{
                  padding: '1px 7px',
                  borderRadius: '9999px',
                  fontSize: '10px',
                  fontWeight: '900',
                  backgroundColor: absentSubTab === 'currently_away' ? 'rgba(255,255,255,0.25)' : '#ffedd5',
                  color: absentSubTab === 'currently_away' ? '#ffffff' : '#9a3412'
                }}>
                  {absentStaff.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAbsentSubTab('extended_log')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: absentSubTab === 'extended_log' ? '1px solid #b91c1c' : '1px solid #fecdd3',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  backgroundColor: absentSubTab === 'extended_log' ? '#b91c1c' : '#ffffff',
                  color: absentSubTab === 'extended_log' ? '#ffffff' : '#991b1b',
                  boxShadow: absentSubTab === 'extended_log' ? '0 2px 4px rgba(185, 28, 28, 0.25)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
                📋 Absence & Break Audit Log
                <span style={{
                  padding: '1px 7px',
                  borderRadius: '9999px',
                  fontSize: '10px',
                  fontWeight: '900',
                  backgroundColor: absentSubTab === 'extended_log' ? 'rgba(255,255,255,0.25)' : '#fee2e2',
                  color: absentSubTab === 'extended_log' ? '#ffffff' : '#991b1b'
                }}>
                  {allAbsences.length}
                </span>
              </button>
            </div>

            {absentSubTab === 'extended_log' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Period Pills: Today, Yesterday, Last 3 Days, Last 7 Days, Custom */}
                <div style={{ display: 'flex', backgroundColor: '#fee2e2', borderRadius: '8px', padding: '2px', gap: '2px' }}>
                  {[
                    ['today', 'Today'],
                    ['yesterday', 'Yesterday'],
                    ['3d', 'Last 3 Days'],
                    ['7d', 'Last 7 Days'],
                    ['custom', 'Custom Range']
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAbsencePeriod(id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        backgroundColor: absencePeriod === id ? '#b91c1c' : 'transparent',
                        color: absencePeriod === id ? '#ffffff' : '#991b1b',
                        boxShadow: absencePeriod === id ? '0 1px 2px rgba(185, 28, 28, 0.3)' : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Single Date Picker for Today / Yesterday */}
                {(absencePeriod === 'today' || absencePeriod === 'yesterday') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b' }}>📅 Shift Date:</span>
                    <input
                      type="date"
                      value={ledgerDate}
                      onChange={(e) => setLedgerDate(e.target.value)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '7px',
                        border: '1px solid #fca5a5',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: '#ffffff',
                        color: '#991b1b',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    />
                  </div>
                )}

                {/* Multi-Day Range Pickers for Custom Range */}
                {absencePeriod === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b' }}>From:</span>
                    <input
                      type="date"
                      value={absenceCustomStart}
                      onChange={(e) => setAbsenceCustomStart(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: '#ffffff',
                        color: '#991b1b',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b' }}>To:</span>
                    <input
                      type="date"
                      value={absenceCustomEnd}
                      onChange={(e) => setAbsenceCustomEnd(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: '#ffffff',
                        color: '#991b1b',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    />
                  </div>
                )}

                {ledgerLoading && (
                  <LoadingSpinner size={13} color="#b91c1c" trackColor="rgba(185, 28, 28, 0.2)" />
                )}
              </div>
            )}
          </div>

          {/* SUB-VIEW 1: CURRENTLY AWAY (LIVE SHIFT) */}
          {absentSubTab === 'currently_away' && (
            <div>
              {/* Executive Absence Insight Banner */}
              <div style={{
                padding: '16px 20px',
                backgroundColor: '#fff7ed',
                borderBottom: '1px solid #fed7aa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: '#fed7aa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c2410c'
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
                    </svg>
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#9a3412' }}>
                      Shift Working Hours — Live Absence Monitoring
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#c2410c' }}>
                      Tracks on-duty employees who crossed the exit gate during working hours and have not yet returned. Checked-out employees are excluded.
                    </p>
                  </div>
                </div>

                {/* Quick Metrics */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #fdba74', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Currently Away</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#ea580c' }}>{absentStats.total} Staff</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #fdba74', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Avg Time Away</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#c2410c' }}>{absentStats.avgStr}</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #fdba74', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Over 30 Mins</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#b91c1c' }}>{absentStats.over30} Staff</div>
                  </div>
                </div>
              </div>

              {/* Absence Filter Bar */}
              <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#fafbfc' }}>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search absent employee..."
                    style={{ paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#0f172a', outline: 'none', width: '210px' }}
                  />
                </div>

                {/* Severity Sub-Filter Pills */}
                <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                  {[
                    ['all', `All Absent (${absentStaff.length})`],
                    ['lt30', `< 30m (${absentStaff.filter(s => s.live_missing_mins < 30).length})`],
                    ['gt30', `> 30m (${absentStats.over30})`],
                    ['gt60', `> 1h (${absentStats.over60})`]
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setAbsentFilter(id)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '5px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        backgroundColor: absentFilter === id ? '#ffffff' : 'transparent',
                        color: absentFilter === id ? '#ea580c' : '#64748b',
                        boxShadow: absentFilter === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Department Dropdown */}
                <select
                  value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="all">All Departments</option>
                  {Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([d, c]) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                  Sorted by: <strong>Longest Absence First</strong> · Live auto-updated
                </span>
              </div>

              {/* Absent Staff Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Employee ID', 'Employee / Face', 'Department', 'Shift Check-In', 'Premises Exit Time', 'Duty Before Exit', 'Time Missing / Absent', 'Exit Camera / Gate', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '800', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAbsent.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>
                            ✓ All Staff Are Currently Inside Premises
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            No active on-duty employees currently detected outside premises.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredAbsent.map((v, idx) => {
                        const thumb = v.crops?.[0] || v.photo_b64 || null;
                        const displayName = v.name || v.display_name || v.id;
                        const isEnrolled = Boolean(v.is_enrolled);
                        const missingMins = v.live_missing_mins || 1;
                        const missingStr = v.live_missing_str || `${missingMins}m`;

                        // Severity classification
                        let badgeBg = '#fef3c7';
                        let badgeColor = '#b45309';
                        let severityLabel = 'Break / Away';
                        if (missingMins >= 60) {
                          badgeBg = '#fee2e2';
                          badgeColor = '#b91c1c';
                          severityLabel = 'Critical Absence';
                        } else if (missingMins >= 30) {
                          badgeBg = '#ffedd5';
                          badgeColor = '#c2410c';
                          severityLabel = 'Extended Absence';
                        }

                        return (
                          <tr
                            key={v.id}
                            onClick={() => {
                              if (onSelectEmployee) onSelectEmployee(v.id);
                            }}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fffaf5',
                              cursor: 'pointer',
                              transition: 'background-color 0.1s ease'
                            }}
                          >
                            {/* Employee ID */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                fontWeight: '700',
                                color: '#0284c7'
                              }}>
                                {v.emp_code || v.id}
                              </span>
                            </td>

                            {/* Employee Avatar & Name */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '7px',
                                  overflow: 'hidden',
                                  border: '1.5px solid #fdba74',
                                  backgroundColor: '#fff7ed',
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  {thumb ? (
                                    <img
                                      src={thumb.startsWith('data:') ? thumb : `data:image/jpeg;base64,${thumb}`}
                                      alt={v.id}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#9a3412' }}>
                                      {displayName.slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </div>

                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontWeight: isEnrolled ? '700' : '600', color: '#0f172a' }}>
                                      {displayName}
                                    </span>
                                    <span style={{
                                      fontSize: '9px',
                                      fontWeight: '800',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      backgroundColor: '#fee2e2',
                                      color: '#dc2626',
                                      border: '1px solid #fca5a5'
                                    }}>
                                      ● OUT
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>
                                    {v.designation || 'Staff Member'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Department */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                backgroundColor: '#f1f5f9',
                                color: '#334155'
                              }}>
                                {v.department || 'General Staff'}
                              </span>
                            </td>

                            {/* Shift Check-In */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#0369a1', fontWeight: '700' }}>
                                {fmtTime(v.today_check_in)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                Staff Inbound Entry
                              </div>
                            </td>

                            {/* Premises Exit Time */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#b91c1c', fontWeight: '700' }}>
                                {fmtTime(v.exit_time_iso || v.today_check_out || v.last_seen)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                Departed via Exit Gate
                              </div>
                            </td>

                            {/* Duty Before Exit */}
                            <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>
                              {v.duty_before_exit_str || v.today_duration_str || `${v.today_duration_mins || 0}m on-site`}
                            </td>

                            {/* Time Missing / Absent Duration (Live) */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                fontWeight: '800',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: badgeColor }} />
                                <span>{missingStr} missing</span>
                              </div>
                              <div style={{ fontSize: '10px', color: badgeColor, fontWeight: '700', marginTop: '2px' }}>
                                {severityLabel}
                              </div>
                            </td>

                            {/* Exit Camera / Gate */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#334155' }}>
                                {v.last_camera_name || v.camera_name || 'Staff Check-Out Exit'}
                              </div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                Gate 02 Departure
                              </div>
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onSelectEmployee) onSelectEmployee(v.id);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#fff7ed',
                                    border: '1px solid #fdba74',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    color: '#c2410c',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Inspect biometric photos and movement journey"
                                >
                                  View Journey ➔
                                </button>
                                <button
                                  onClick={(e) => handleDeleteEmployee(v.id, v.name || v.id, e)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: '#fff1f2',
                                    border: '1px solid #fecdd3',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    color: '#e11d48',
                                    fontWeight: '700',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title="Permanently delete profile and records"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: EXTENDED BREAK & ABSENCE AUDIT LOG */}
          {absentSubTab === 'extended_log' && (
            <div>
              {/* Executive Extended Absence Insight Banner */}
              <div style={{
                padding: '16px 20px',
                backgroundColor: '#fef2f2',
                borderBottom: '1px solid #fecdd3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#b91c1c'
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#991b1b' }}>
                      Shift Working Hours — Absence &amp; Break Audit Log
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#b91c1c' }}>
                      Permanent historical audit log of staff absent from premises during shift hours. Preserved even after employees return or complete their shift.
                    </p>
                  </div>
                </div>

                {/* Quick Metrics for Absences & Breaks */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#991b1b', textTransform: 'uppercase' }}>Total Absences</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#b91c1c' }}>{extendedStats.total} Records</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #86efac', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>Short Breaks (&lt;{absencePolicyMinutes}m)</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#15803d' }}>{extendedStats.shortBreaks} Breaks</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#991b1b', textTransform: 'uppercase' }}>Policy Breaches (≥{absencePolicyMinutes}m)</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#b91c1c' }}>{extendedStats.breaches} Staff</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #fed7aa', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Still Outside</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#ea580c' }}>{extendedStats.away} Staff</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #86efac', padding: '6px 12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>Returned to Duty</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#15803d' }}>{extendedStats.returned} Staff</div>
                  </div>
                </div>
              </div>

              {/* Extended Absence Filter Bar */}
              <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fafbfc' }}>
                {/* Row 1: Search, Policy Sub-filter, Status Sub-filter, Department, Policy Setup Widget, Excel Export */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Search */}
                  <div style={{ position: 'relative' }}>
                    <svg style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input
                      value={extendedSearch}
                      onChange={e => setExtendedSearch(e.target.value)}
                      placeholder="Search employee name, ID..."
                      style={{ paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#0f172a', outline: 'none', width: '200px' }}
                    />
                  </div>

                  {/* Policy Sub-Filter Pills */}
                  <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                    {[
                      ['all', `All (${allAbsences.length})`],
                      ['short', `Short <${absencePolicyMinutes}m (${extendedStats.shortBreaks})`],
                      ['extended', `Breaches ≥${absencePolicyMinutes}m (${extendedStats.breaches})`]
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAbsencePolicyFilter(id)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          backgroundColor: absencePolicyFilter === id ? '#ffffff' : 'transparent',
                          color: absencePolicyFilter === id ? '#0284c7' : '#64748b',
                          boxShadow: absencePolicyFilter === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Status Sub-Filter Pills */}
                  <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                    {[
                      ['all', `All (${allAbsences.length})`],
                      ['away', `🔴 Outside (${extendedStats.away})`],
                      ['returned', `✓ Returned (${extendedStats.returned})`]
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setExtendedStatusFilter(id)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          backgroundColor: extendedStatusFilter === id ? '#ffffff' : 'transparent',
                          color: extendedStatusFilter === id ? '#b91c1c' : '#64748b',
                          boxShadow: extendedStatusFilter === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Department Dropdown */}
                  <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="all">All Departments</option>
                    {Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([d, c]) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  {/* In-UI Policy Rule Control Widget */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '8px',
                    padding: '4px 8px'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#9f1239', whiteSpace: 'nowrap' }}>
                      ⚙️ Policy: Max
                    </span>
                    <input
                      type="number"
                      min="5"
                      max="480"
                      value={absencePolicyMinutes}
                      onChange={(e) => {
                        const val = Math.max(5, parseInt(e.target.value, 10) || 15);
                        setAbsencePolicyMinutes(val);
                        try { localStorage.setItem('godezk_absence_policy_minutes', String(val)); } catch (err) {}
                      }}
                      style={{
                        width: '42px',
                        padding: '2px 4px',
                        textAlign: 'center',
                        fontWeight: '900',
                        fontSize: '11px',
                        border: '1px solid #e11d48',
                        borderRadius: '5px',
                        color: '#9f1239',
                        backgroundColor: '#ffffff',
                        outline: 'none'
                      }}
                      title="Directly edit allowed policy break minutes"
                    />
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#9f1239' }}>m</span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[30, 45, 60, 90, 120].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            setAbsencePolicyMinutes(mins);
                            try { localStorage.setItem('godezk_absence_policy_minutes', String(mins)); } catch (err) {}
                          }}
                          style={{
                            padding: '2px 5px',
                            borderRadius: '4px',
                            border: absencePolicyMinutes === mins ? '1px solid #be123c' : '1px solid #fecdd3',
                            backgroundColor: absencePolicyMinutes === mins ? '#be123c' : '#ffffff',
                            color: absencePolicyMinutes === mins ? '#ffffff' : '#9f1239',
                            fontSize: '10px',
                            fontWeight: '800',
                            cursor: 'pointer'
                          }}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Excel Export Button */}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                      href={`/api/attendance/export/absences?date=${ledgerDate}&period=${absencePeriod}&start_date=${absenceCustomStart}&end_date=${absenceCustomEnd}&org=${activeOrgId || 'medanta'}`}
                      download={`absence_audit_${activeOrgId || 'medanta'}_${absencePeriod}.xlsx`}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: '1px solid #ea580c',
                        backgroundColor: '#ea580c',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        textDecoration: 'none',
                        boxShadow: '0 1px 2px rgba(234, 88, 12, 0.2)'
                      }}
                      title="Export Shift Absence & Break Audit Log to Excel"
                    >
                      <span>📥</span>
                      <span>Export to Excel</span>
                    </a>
                  </div>
                </div>

                {/* Row 2: Away Duration Filter Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ⏳ Total Away Duration:
                  </span>
                  <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px', flexWrap: 'wrap' }}>
                    {[
                      ['all', 'All'],
                      ['lt30', '< 30m'],
                      ['30to60', '30m – 60m'],
                      ['gt60', '> 1 hr'],
                      ['gt120', '> 2 hrs'],
                      ['gt180', '> 3 hrs'],
                      ['custom', 'Custom ⏱️']
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAbsenceDurationFilter(id)}
                        style={{
                          padding: '3px 9px',
                          borderRadius: '5px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          backgroundColor: absenceDurationFilter === id ? '#ffffff' : 'transparent',
                          color: absenceDurationFilter === id ? '#0f766e' : '#64748b',
                          boxShadow: absenceDurationFilter === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Duration Selector */}
                  {absenceDurationFilter === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f0fdfa', padding: '3px 8px', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#0f766e' }}>Filter:</span>
                      <select
                        value={customDurationOp}
                        onChange={e => setCustomDurationOp(e.target.value)}
                        style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid #99f6e4', fontSize: '11px', fontWeight: '700', color: '#0f766e', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="gt">Greater than (&gt;)</option>
                        <option value="gte">Greater or equal (≥)</option>
                        <option value="lt">Less than (&lt;)</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={customDurationMins}
                        onChange={e => setCustomDurationMins(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        style={{ width: '45px', padding: '2px 4px', textAlign: 'center', fontWeight: '800', fontSize: '11px', border: '1px solid #99f6e4', borderRadius: '4px', color: '#0f766e', outline: 'none' }}
                      />
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#0f766e' }}>mins</span>
                    </div>
                  )}

                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b' }}>
                    Showing <strong>{filteredExtended.length}</strong> of <strong>{allAbsences.length}</strong> events
                    {ledgerData?.date_range_label && ` · ${ledgerData.date_range_label}`}
                  </span>
                </div>
              </div>

              {/* Extended Absence Log Table */}
              <div style={{ overflowX: 'auto', position: 'relative' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Shift Date', 'Employee ID', 'Employee / Face', 'Department', 'Departed Time (Exit Gate)', 'Returned Time (Entry Gate)', 'Total Away Duration', 'Allowed Policy', 'Overstay Exceeded', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '800', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExtended.length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>
                            ✓ No Absences or Breaks Recorded for Selected Filter
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            All employee breaks during this period will appear here with departure and return checkpoints.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredExtended.map((item, idx) => {
                        const matchedVis = visitors.find(v => v.id === item.employee_id);
                        const thumb = item.photo_b64 || matchedVis?.crops?.[0] || matchedVis?.photo_b64 || null;
                        const isAway = item.status === 'Currently Away';
                        const durStr = item.duration_str || `${item.duration_minutes || 0}m`;
                        const overstayMins = Math.max(0, (item.duration_minutes || 0) - absencePolicyMinutes);
                        const overstayStr = `+${overstayMins}m`;

                        return (
                          <tr
                            key={item.break_id || `${item.employee_id}-${idx}`}
                            onClick={() => {
                              if (onSelectEmployee) onSelectEmployee(item.employee_id);
                            }}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fffaf5',
                              cursor: 'pointer',
                              transition: 'background-color 0.1s ease'
                            }}
                          >
                            {/* Shift Date */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800',
                                backgroundColor: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                📅 {item.date_display || item.date || ledgerDate}
                              </span>
                            </td>

                            {/* ID */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', color: '#0284c7' }}>
                                {item.employee_id}
                              </span>
                            </td>

                            {/* Face / Name */}
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={item.name}
                                    style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                                  />
                                ) : (
                                  <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: '#fee2e2',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '800',
                                    color: '#b91c1c',
                                    fontSize: '11px'
                                  }}>
                                    {(item.name || item.employee_id || 'U')[0].toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontWeight: '700', color: '#0f172a' }}>{item.name || item.employee_id}</div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Verified Sighting</div>
                                </div>
                              </div>
                            </td>

                            {/* Department */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '5px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                color: '#475569'
                              }}>
                                {item.department || 'General Staff'}
                              </span>
                            </td>

                            {/* Departed Time (Exit Gate) */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                                <span style={{ fontWeight: '700', color: '#b91c1c', fontFamily: 'var(--font-mono)' }}>
                                  {item.exit_display || fmtTime(item.exit_time)}
                                </span>
                              </div>
                              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                                {item.exit_camera_name || 'Exit Gate'}
                              </div>
                            </td>

                            {/* Returned Time (Entry Gate) */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              {item.entry_time ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                                    <span style={{ fontWeight: '700', color: '#15803d', fontFamily: 'var(--font-mono)' }}>
                                      {item.entry_display || fmtTime(item.entry_time)}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                                    {item.entry_camera_name || 'Inbound Checkpoint'}
                                  </div>
                                </>
                              ) : (
                                <span style={{
                                  padding: '3px 8px',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626'
                                }}>
                                  Still Outside
                                </span>
                              )}
                            </td>

                            {/* Total Away Duration */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: (item.duration_minutes || 0) >= absencePolicyMinutes ? '#fee2e2' : '#f0fdf4',
                                color: (item.duration_minutes || 0) >= absencePolicyMinutes ? '#b91c1c' : '#15803d',
                                fontWeight: '800',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: (item.duration_minutes || 0) >= absencePolicyMinutes ? '#dc2626' : '#16a34a' }} />
                                <span>{durStr}</span>
                              </div>
                            </td>

                            {/* Allowed Policy */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '5px',
                                fontSize: '11px',
                                fontWeight: '700',
                                backgroundColor: '#f1f5f9',
                                color: '#475569'
                              }}>
                                {absencePolicyMinutes}m Policy
                              </span>
                            </td>

                            {/* Overstay Exceeded */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              {overstayMins > 0 ? (
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  fontFamily: 'var(--font-mono)',
                                  backgroundColor: '#fee2e2',
                                  color: '#b91c1c',
                                  border: '1px solid #fca5a5'
                                }}>
                                  ⚠️ {overstayStr}
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                              )}
                            </td>

                            {/* Status */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '4px 9px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800',
                                backgroundColor: isAway ? '#fee2e2' : '#f0fdf4',
                                color: isAway ? '#dc2626' : '#15803d'
                              }}>
                                {isAway ? '🔴 Currently Away' : '✓ Returned'}
                              </span>
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onSelectEmployee) onSelectEmployee(item.employee_id);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#fee2e2',
                                    border: '1px solid #fca5a5',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    color: '#991b1b',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Inspect biometric timeline and sighting journey"
                                >
                                  View Journey ➔
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const isOverstay = (item.duration_minutes || 0) >= absencePolicyMinutes;
                                    setEmailAlertModalData({
                                      alertType: 'absence_breach',
                                      subject: `🚨 Medanta Alert: Staff Absence Policy ${isOverstay ? 'Breach' : 'Advisory'} — ${item.name || item.employee_id} (${item.department || 'General Staff'})`,
                                      title: 'Shift Working Hours — Staff Absence Policy Advisory',
                                      summary: `Staff member ${item.name || item.employee_id} recorded an away duration of ${durStr} during active shift hours (${absencePolicyMinutes}m Policy).`,
                                      metadata: {
                                        'Employee ID': item.employee_id,
                                        'Employee Name': item.name || item.employee_id,
                                        'Department': item.department || 'General Staff',
                                        'Departed Time': `${item.exit_display || fmtTime(item.exit_time)} (${item.exit_camera_name || 'Exit Gate'})`,
                                        'Returned Time': isAway ? 'Still Outside (Has not returned)' : `${item.entry_display || fmtTime(item.entry_time)} (${item.entry_camera_name || 'Entry Gate'})`,
                                        'Away Duration': durStr,
                                        'Allowed Policy': `${absencePolicyMinutes}m Policy`,
                                        'Compliance Status': isOverstay ? 'Policy Overstay Breach' : 'Within Policy'
                                      },
                                      faceCrop: matchedVis?.crops?.[0] || thumb || null,
                                      bodyCrop: matchedVis?.body_b64 || matchedVis?.photo_b64 || item.photo_b64 || thumb || null
                                    });
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#fff7ed',
                                    border: '1px solid #fdba74',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    color: '#c2410c',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Dispatch email advisory regarding this absence via Email Microservice (Port 31040)"
                                >
                                  ✉ Alert
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <LoadingOverlay
                  visible={Boolean(ledgerData && ledgerLoading)}
                  spinnerSize={30}
                  color="#b91c1c"
                  trackColor="rgba(185, 28, 28, 0.2)"
                  message={`Loading absences & breaks...`}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: SECURITY WATCHLIST / BLACKLISTED PERSONS */}
      {activeSection === 'watchlist' && (
        <div>
          {/* Security Alert Header Banner */}
          <div style={{
            padding: '16px 20px',
            backgroundColor: '#fff1f2',
            borderBottom: '1px solid #fecdd3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#ffe4e6',
                border: '1px solid #fecdd3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#be123c'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#9f1239' }}>
                  Security Watchlist & Blacklisted Persons Registry
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#be123c' }}>
                  Active CCTV biometric surveillance continuously compares faces in all camera feeds against this registry. Any match instantly triggers high-priority security HUD alerts.
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #fda4af', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#9f1239', textTransform: 'uppercase' }}>Flagged Persons</div>
                <div style={{ fontSize: '15px', fontWeight: '900', color: '#be123c' }}>{combinedWatchlist.length} Total</div>
              </div>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #fda4af', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#9f1239', textTransform: 'uppercase' }}>Detected Today</div>
                <div style={{ fontSize: '15px', fontWeight: '900', color: '#991b1b' }}>
                  {combinedWatchlist.filter(w => visitors.some(v => {
                    const wid = String(w.alias || w.id || '').toLowerCase();
                    return String(v.id || '').toLowerCase() === wid;
                  })).length} Sighted
                </div>
              </div>
            </div>
          </div>

          {/* Search & Actions Bar */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#fafbfc' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                value={watchlistSearch}
                onChange={e => setWatchlistSearch(e.target.value)}
                placeholder="Search flagged person, ID, or reason..."
                style={{ paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', color: '#0f172a', outline: 'none', width: '260px' }}
              />
            </div>

            <button
              onClick={() => setAddWatchlistOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '7px',
                backgroundColor: '#be123c',
                color: '#fff',
                border: 'none',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              + Add to Watchlist
            </button>

            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
              {filteredWatchlist.length} flagged individuals registered
            </span>
          </div>

          {/* Watchlist Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Person / Photo', 'Target / Alias ID', 'Category / Role', 'Reason / Security Flag', 'Date Added', 'Today\'s CCTV Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '800', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#be123c', marginBottom: '4px' }}>
                        No Security Watchlist Entries Found
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {watchlistSearch
                          ? `No records match "${watchlistSearch}".`
                          : "Use '+ Add to Watchlist' above, or enable 'CLICK-TO-FLAG' on the live video stream to flag a person directly."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map((w, idx) => {
                    const targetId = w.alias || w.id;
                    const displayName = w.name || targetId;
                    const thumb = (w.crops && w.crops[0]) || w.photo_b64 || null;
                    const addedDate = fmtTime(w.enrolled_at || w.created_at);

                    // Check if seen today in visitors list
                    const visMatch = visitors.find(v => {
                      const vid = String(v.id || '').toLowerCase();
                      const wid = String(w.alias || w.id || '').toLowerCase();
                      return vid === wid;
                    });
                    const isSightedToday = Boolean(visMatch);

                    return (
                      <tr
                        key={w.id || idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fffbfa',
                          transition: 'background 0.1s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fff1f2'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#fffbfa'; }}
                      >
                        {/* Person / Photo */}
                        <td style={{ padding: '10px 14px', minWidth: '190px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '7px',
                              overflow: 'hidden',
                              border: '1.5px solid #fda4af',
                              backgroundColor: '#ffe4e6',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {thumb ? (
                                <img
                                  src={thumb.startsWith('data:') ? thumb : `data:image/jpeg;base64,${thumb}`}
                                  alt={displayName}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#be123c' }}>
                                  {displayName.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: '700', color: '#0f172a' }}>{displayName}</div>
                              <span style={{
                                fontSize: '9px',
                                fontWeight: '800',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                backgroundColor: '#fee2e2',
                                color: '#be123c',
                                border: '1px solid #fca5a5'
                              }}>
                                🚨 BLACKLISTED
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Target / Alias ID */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', fontSize: '12px', color: '#0284c7' }}>
                            {targetId}
                          </span>
                        </td>

                        {/* Category / Role */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#475569', fontWeight: '600' }}>
                            {w.category || (visMatch?.department) || 'Visitor / Staff'}
                          </span>
                        </td>

                        {/* Reason / Security Flag */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 8px',
                            borderRadius: '5px',
                            backgroundColor: '#fff1f2',
                            color: '#9f1239',
                            border: '1px solid #fecdd3',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            <span>⚠️</span>
                            <span>{w.reason || 'Security Alert'}</span>
                          </div>
                        </td>

                        {/* Date Added */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#64748b' }}>
                          {addedDate}
                        </td>

                        {/* Today's CCTV Status */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {isSightedToday ? (
                            <div>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                backgroundColor: '#fee2e2',
                                color: '#dc2626',
                                fontSize: '10px',
                                fontWeight: '800'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
                                SIGHTED ON CAMERA
                              </div>
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                {fmtTime(visMatch.last_seen)} · {visMatch.last_camera_name || visMatch.camera_name || 'Staff Inbound'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Not sighted today
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`Remove ${displayName} (${targetId}) from the security watchlist?`)) {
                                  if (onRemoveBlacklist) {
                                    await onRemoveBlacklist(w);
                                  }
                                  showNotice(`✓ Removed ${displayName} from watchlist`);
                                  if (onDataRefresh) onDataRefresh();
                                }
                              }}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: '#fef2f2',
                                border: '1px solid #fecaca',
                                fontSize: '11px',
                                cursor: 'pointer',
                                color: '#b91c1c',
                                fontWeight: '700'
                              }}
                              title="Remove from watchlist"
                            >
                              ✓ Unflag / Remove
                            </button>

                            {visMatch && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectEmployee) onSelectEmployee(targetId);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: '#f0f9ff',
                                  border: '1px solid #bae6fd',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  color: '#0284c7',
                                  fontWeight: '700'
                                }}
                                title="Audit full CCTV movement journey"
                              >
                                Audit Journey ➔
                              </button>
                            )}

                            <button
                              onClick={(e) => handleDeleteEmployee(targetId, displayName, e)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#fff1f2',
                                border: '1px solid #fecdd3',
                                fontSize: '11px',
                                cursor: 'pointer',
                                color: '#e11d48',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Permanently delete profile and records from system"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 5: ZONE INTRUSIONS / RESTRICTED AREA BREACHES                        */}
      {/* ========================================================================= */}
      {activeSection === 'zone_intrusion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            backgroundColor: '#fff',
            borderRadius: '12px',
            border: '1px solid #fee2e2',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecdd3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
                fontSize: '20px'
              }}>
                🚫
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#991b1b' }}>
                  Restricted Zone & Area Intrusion Audit
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Biometric tracking of employees detected on prohibited cameras and restricted checkpoints.
                </p>
              </div>
            </div>

            {/* Live Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '20px',
                backgroundColor: zoneKpis.active > 0 ? '#fef2f2' : '#f0fdf4',
                color: zoneKpis.active > 0 ? '#dc2626' : '#16a34a',
                border: `1px solid ${zoneKpis.active > 0 ? '#fecdd3' : '#bbf7d0'}`
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: zoneKpis.active > 0 ? '#dc2626' : '#16a34a'
                }} />
                {zoneKpis.active > 0 ? `${zoneKpis.active} ACTIVE INTRUSIONS` : 'ALL ZONES SECURE'}
              </span>
            </div>
          </div>

          {/* Executive KPI Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px'
          }}>
            {/* KPI 1 */}
            <div style={{
              backgroundColor: '#fff',
              padding: '14px 18px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Breaches Logged
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
                {zoneKpis.total}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Cumulative incident events
              </div>
            </div>

            {/* KPI 2 */}
            <div style={{
              backgroundColor: '#fff',
              padding: '14px 18px',
              borderRadius: '10px',
              border: `1px solid ${zoneKpis.active > 0 ? '#fecdd3' : '#e2e8f0'}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: zoneKpis.active > 0 ? '#dc2626' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Alerts
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: zoneKpis.active > 0 ? '#dc2626' : '#059669', marginTop: '4px' }}>
                {zoneKpis.active}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Pending officer review
              </div>
            </div>

            {/* KPI 3 */}
            <div style={{
              backgroundColor: '#fff',
              padding: '14px 18px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Unique Violators
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
                {zoneKpis.uniqueViolators}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Distinct staff members
              </div>
            </div>

            {/* KPI 4 */}
            <div style={{
              backgroundColor: '#fff',
              padding: '14px 18px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Most Breached Zone
              </div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#b91c1c', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {zoneKpis.mostBreached}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Highest frequency checkpoint
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#fff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {/* Search */}
              <input
                type="text"
                placeholder="Search staff, ID, zone..."
                value={zoneSearch}
                onChange={e => setZoneSearch(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  width: '210px',
                  outline: 'none'
                }}
              />

              {/* Status Pills */}
              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setZoneStatusFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    backgroundColor: zoneStatusFilter === 'all' ? '#ffffff' : 'transparent',
                    color: zoneStatusFilter === 'all' ? '#0f172a' : '#64748b',
                    boxShadow: zoneStatusFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  All ({zoneIntrusions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setZoneStatusFilter('active')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    backgroundColor: zoneStatusFilter === 'active' ? '#dc2626' : 'transparent',
                    color: zoneStatusFilter === 'active' ? '#ffffff' : '#64748b',
                    boxShadow: zoneStatusFilter === 'active' ? '0 1px 2px rgba(220, 38, 38, 0.2)' : 'none'
                  }}
                >
                  🔴 Active ({zoneKpis.active})
                </button>
                <button
                  type="button"
                  onClick={() => setZoneStatusFilter('acknowledged')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    backgroundColor: zoneStatusFilter === 'acknowledged' ? '#059669' : 'transparent',
                    color: zoneStatusFilter === 'acknowledged' ? '#ffffff' : '#64748b',
                    boxShadow: zoneStatusFilter === 'acknowledged' ? '0 1px 2px rgba(5, 150, 105, 0.2)' : 'none'
                  }}
                >
                  ✓ Acknowledged ({zoneIntrusions.length - zoneKpis.active})
                </button>
              </div>

              {/* Zone Filter */}
              <select
                value={zoneCameraFilter}
                onChange={e => setZoneCameraFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  backgroundColor: '#fff',
                  outline: 'none',
                  color: '#334155'
                }}
              >
                <option value="all">All Checkpoints / Zones</option>
                {availableCameras.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.location || c.role})
                  </option>
                ))}
              </select>

              {/* Date Filter */}
              <input
                type="date"
                value={zoneDateFilter}
                onChange={e => setZoneDateFilter(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  backgroundColor: '#fff',
                  outline: 'none',
                  color: '#334155'
                }}
              />
              {zoneLoading && (
                <LoadingSpinner size={13} color="#991b1b" trackColor="rgba(153, 27, 27, 0.2)" />
              )}
              {zoneDateFilter && (
                <button
                  type="button"
                  onClick={() => setZoneDateFilter('')}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    fontSize: '11px',
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  Clear Date
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {zoneKpis.active > 0 && (
                <button
                  type="button"
                  onClick={handleAcknowledgeAllIntrusions}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#059669',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 1px 2px rgba(5, 150, 105, 0.2)'
                  }}
                >
                  ✓ Acknowledge All Active ({zoneKpis.active})
                </button>
              )}
              <button
                type="button"
                onClick={() => fetchZoneIntrusions(false)}
                disabled={zoneLoading}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: zoneLoading ? '#fef2f2' : '#f8fafc',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: zoneLoading ? '#991b1b' : '#475569',
                  cursor: zoneLoading ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {zoneLoading ? (
                  <LoadingSpinner size={12} color="#991b1b" trackColor="rgba(153, 27, 27, 0.2)" />
                ) : (
                  <span>🔄</span>
                )}
                <span>{zoneLoading ? 'Loading...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Audit Table */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            position: 'relative',
            minHeight: zoneLoading ? '200px' : undefined
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '700' }}>
                  <th style={{ padding: '12px 16px' }}>Incident Time & Date</th>
                  <th style={{ padding: '12px 16px' }}>Employee Identity</th>
                  <th style={{ padding: '12px 16px' }}>Breached Zone / Camera</th>
                  <th style={{ padding: '12px 16px' }}>CCTV Evidence</th>
                  <th style={{ padding: '12px 16px' }}>Alert Status</th>
                  <th style={{ padding: '12px 16px' }}>Audit Actions</th>
                </tr>
              </thead>
              <tbody>
                {zoneLoading && filteredZoneIntrusions.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '44px 16px', textAlign: 'center' }}>
                      <LoadingSpinner
                        size={30}
                        color="#991b1b"
                        trackColor="rgba(153, 27, 27, 0.2)"
                        layout="stacked"
                        label="Loading restricted zone intrusion records..."
                        sublabel="Querying database"
                      />
                    </td>
                  </tr>
                ) : filteredZoneIntrusions.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                        No Zone Intrusion Incidents Found
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '440px', margin: '4px auto 0' }}>
                        {zoneSearch || zoneStatusFilter !== 'all' || zoneCameraFilter !== 'all' || zoneDateFilter
                          ? 'No intrusion events match your filter criteria. Try adjusting or clearing your filters.'
                          : 'No staff members have entered prohibited zones. Designate restricted camera checkpoints for employees via the "Edit" action in the Employee Details tab.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredZoneIntrusions.map((z, idx) => {
                    const isAlert = z.status === 'active';
                    return (
                      <tr
                        key={z.id || idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: isAlert ? '#fff5f5' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')
                        }}
                      >
                        {/* Time & Date */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>
                            {fmtTime(z.timestamp)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {z.date || (z.timestamp ? z.timestamp.split('T')[0] : 'Today')}
                          </div>
                        </td>

                        {/* Employee Identity */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              backgroundColor: '#e2e8f0',
                              border: '1px solid #cbd5e1',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '800',
                              color: '#64748b',
                              fontSize: '11px'
                            }}>
                              {z.face_crop_b64 ? (
                                <img
                                  src={z.face_crop_b64.startsWith('data:') ? z.face_crop_b64 : `data:image/jpeg;base64,${z.face_crop_b64}`}
                                  alt={z.employee_id}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                (z.employee_name || z.employee_id || 'EM').slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: '700', color: '#0f172a' }}>
                                {z.employee_name || z.employee_id}
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '800',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  backgroundColor: '#f1f5f9',
                                  color: '#475569'
                                }}>
                                  {z.employee_id}
                                </span>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                  {z.department || 'General Staff'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Breached Zone / Camera */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#fee2e2', border: '1px solid #fecdd3' }}>
                            <span style={{ fontSize: '13px' }}>🚫</span>
                            <span style={{ fontWeight: '800', color: '#991b1b' }}>
                              {z.camera_name || z.camera_id}
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>
                            ID: {z.camera_id}
                          </div>
                        </td>

                        {/* CCTV Evidence */}
                        <td style={{ padding: '12px 16px' }}>
                          {z.face_crop_b64 ? (
                            <div style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: isAlert ? '2px solid #ef4444' : '1px solid #cbd5e1',
                              boxShadow: isAlert ? '0 0 6px rgba(239, 68, 68, 0.4)' : 'none'
                            }}>
                              <img
                                src={z.face_crop_b64.startsWith('data:') ? z.face_crop_b64 : `data:image/jpeg;base64,${z.face_crop_b64}`}
                                alt="Breach Evidence"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Live Detected</span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          {isAlert ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: '800',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #f87171'
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
                              ACTIVE ALERT
                            </span>
                          ) : (
                            <div>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: '700',
                                backgroundColor: '#ecfdf5',
                                color: '#059669',
                                border: '1px solid #a7f3d0'
                              }}>
                                ✓ ACKNOWLEDGED
                              </span>
                              {z.acknowledged_by && (
                                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                  by {z.acknowledged_by}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {isAlert && (
                              <button
                                type="button"
                                onClick={() => handleAcknowledgeIntrusion(z.id)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  backgroundColor: '#059669',
                                  color: '#fff',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                                title="Acknowledge & review this incident"
                              >
                                ✓ Acknowledge
                              </button>
                            )}
                            {z.employee_id && onSelectEmployee && (
                              <button
                                type="button"
                                onClick={() => onSelectEmployee(z.employee_id)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  border: '1px solid #bae6fd',
                                  backgroundColor: '#f0f9ff',
                                  color: '#0284c7',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                                title="View employee journey history"
                              >
                                Journey ➔
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteIntrusion(z.id)}
                              style={{
                                padding: '4px 7px',
                                borderRadius: '5px',
                                border: '1px solid #fecdd3',
                                backgroundColor: '#fff1f2',
                                color: '#e11d48',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                              title="Delete record"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <LoadingOverlay
              visible={zoneLoading && filteredZoneIntrusions.length > 0}
              spinnerSize={28}
              color="#991b1b"
              trackColor="rgba(153, 27, 27, 0.2)"
              message="Loading restricted zone records..."
              subtext="Querying database"
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: SINGLE EMPLOYEE MANUAL ATTENDANCE OVERRIDE                       */}
      {/* ========================================================================= */}
      {singleOverrideOpen && overrideEmp && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              backgroundColor: overrideAction === 'check_out' ? '#fff7ed' : '#ecfdf5',
              borderBottom: overrideAction === 'check_out' ? '1px solid #fdba74' : '1px solid #a7f3d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>{overrideAction === 'check_out' ? '🚪' : '🟢'}</span>
                  <h3 style={{
                    margin: 0,
                    fontSize: '17px',
                    fontWeight: '800',
                    color: overrideAction === 'check_out' ? '#9a3412' : '#065f46'
                  }}>
                    Manual Attendance Override
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: '800',
                    backgroundColor: '#fff',
                    border: '1px solid #cbd5e1',
                    color: '#475569'
                  }}>
                    Option 1: Admin Badge
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  Target Staff: <strong style={{ color: '#0f172a' }}>{overrideEmp.name || overrideEmp.displayName || overrideEmp.employee_id || overrideEmp.id}</strong>
                  {' '}({overrideEmp.employee_id || overrideEmp.id})
                  {overrideEmp.department && <span style={{ color: '#94a3b8' }}> • {overrideEmp.department}</span>}
                </div>
              </div>
              <button
                onClick={() => setSingleOverrideOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Notice Banner */}
              {overrideNotice && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: overrideNotice.ok ? '#f0fdf4' : '#fff1f2',
                  border: overrideNotice.ok ? '1px solid #86efac' : '1px solid #fecdd3',
                  color: overrideNotice.ok ? '#166534' : '#991b1b'
                }}>
                  {overrideNotice.msg}
                </div>
              )}

              {/* Action Selector: Check In vs Check Out */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Select Action
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setOverrideAction('check_in')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: overrideAction === 'check_in' ? '2px solid #10b981' : '1px solid #e2e8f0',
                      backgroundColor: overrideAction === 'check_in' ? '#ecfdf5' : '#ffffff',
                      color: overrideAction === 'check_in' ? '#047857' : '#64748b',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    🟢 Mark Check-In (Arrival)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideAction('check_out')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: overrideAction === 'check_out' ? '2px solid #ea580c' : '1px solid #e2e8f0',
                      backgroundColor: overrideAction === 'check_out' ? '#fff7ed' : '#ffffff',
                      color: overrideAction === 'check_out' ? '#c2410c' : '#64748b',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    🚪 Mark Check-Out (Exit)
                  </button>
                </div>
              </div>

              {/* Date & Time Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Attendance Date
                  </label>
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={e => setOverrideDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#0f172a',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Action Time (HH:MM)
                  </label>
                  <input
                    type="time"
                    value={overrideTime}
                    onChange={e => setOverrideTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: '700',
                      color: '#0f172a',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px' }}>
                  Quick Time Presets:
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['09:00', '13:00', '14:00', '17:00', '18:00', '19:00'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOverrideTime(t)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: overrideTime === t ? '#eff6ff' : '#f8fafc',
                        color: overrideTime === t ? '#1d4ed8' : '#475569',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      setOverrideTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    ⏱ Now
                  </button>
                </div>
              </div>

              {/* Reason / Audit Note */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Override Reason & Audit Note
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="e.g. Shift End Regular Check-Out, Permission Slip, Admin Correction"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    color: '#0f172a',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Info Note */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#475569',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px' }}>ℹ️</span>
                <div>
                  <strong>Audit Trail Integrity:</strong> Manual overrides are permanently badged as <code style={{ backgroundColor: '#e2e8f0', padding: '1px 4px', borderRadius: '4px' }}>📝 Admin Override</code>. This recalculates total working duration, breaks, and productivity score automatically.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setSingleOverrideOpen(false)}
                disabled={overrideLoading}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSingleOverrideSubmit}
                disabled={overrideLoading}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: overrideAction === 'check_out' ? '#ea580c' : '#10b981',
                  color: '#ffffff',
                  fontWeight: '800',
                  fontSize: '13px',
                  cursor: overrideLoading ? 'not-allowed' : 'pointer',
                  opacity: overrideLoading ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                {overrideLoading ? 'Applying...' : (overrideAction === 'check_out' ? 'Confirm Check-Out' : 'Confirm Check-In')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: BULK SHIFT CHECK-OUT (E.G., 5:00 PM SHIFT CONCLUSION)             */}
      {/* ========================================================================= */}
      {bulkOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              backgroundColor: '#fff7ed',
              borderBottom: '1px solid #fdba74',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🚪</span>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#9a3412' }}>
                    Shift End Bulk Check-Out
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: '800',
                    backgroundColor: '#fff',
                    border: '1px solid #fed7aa',
                    color: '#c2410c'
                  }}>
                    Batch Departure
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                  Check out multiple staff at shift conclusion in one click (e.g. at 5:00 PM). Automatically completes duty hours & productivity scores.
                </div>
              </div>
              <button
                onClick={() => setBulkOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Notice Banner */}
              {bulkNotice && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: bulkNotice.ok ? '#f0fdf4' : '#fff1f2',
                  border: bulkNotice.ok ? '1px solid #86efac' : '1px solid #fecdd3',
                  color: bulkNotice.ok ? '#166534' : '#991b1b'
                }}>
                  {bulkNotice.msg}
                </div>
              )}

              {/* Time & Date Configuration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Shift Departure Date
                  </label>
                  <input
                    type="date"
                    value={bulkDate}
                    onChange={e => setBulkDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#0f172a',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Check-Out Time (e.g., 17:00)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="time"
                      value={bulkTime}
                      onChange={e => setBulkTime(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setBulkTime('17:00')}
                      style={{
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '1px solid #fdba74',
                        backgroundColor: '#fff7ed',
                        color: '#c2410c',
                        fontSize: '11px',
                        fontWeight: '800',
                        cursor: 'pointer'
                      }}
                      title="Set to 5:00 PM standard shift end"
                    >
                      5 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        setBulkTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                      }}
                      style={{
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#475569',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="Current Clock Time"
                    >
                      Now
                    </button>
                  </div>
                </div>
              </div>

              {/* Reason / Audit Note */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Shift Note / Reason
                </label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={e => setBulkReason(e.target.value)}
                  placeholder="e.g. Regular Shift 09:00 - 17:00 End Check-Out"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    color: '#0f172a',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Staff Selection Area */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', textTransform: 'uppercase' }}>
                    Select Staff to Check Out ({bulkSelectedIds.size} Selected)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const onDutyIds = (ledgerData?.employees || []).filter(e => e.status === 'On Duty').map(e => e.employee_id);
                        setBulkSelectedIds(new Set(onDutyIds));
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #fed7aa',
                        backgroundColor: '#fff7ed',
                        color: '#c2410c',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Select All On Duty ({ (ledgerData?.employees || []).filter(e => e.status === 'On Duty').length })
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = (ledgerData?.employees || []).map(e => e.employee_id);
                        setBulkSelectedIds(new Set(allIds));
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        color: '#475569',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Select All ({ (ledgerData?.employees || []).length })
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSelectedIds(new Set())}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        color: '#64748b',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  maxHeight: '230px',
                  overflowY: 'auto',
                  backgroundColor: '#ffffff'
                }}>
                  {(!ledgerData?.employees || ledgerData.employees.length === 0) ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      No staff members found for the selected date.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px', width: '32px' }}></th>
                          <th style={{ padding: '8px 12px' }}>Employee</th>
                          <th style={{ padding: '8px 12px' }}>Department</th>
                          <th style={{ padding: '8px 12px' }}>Current Status</th>
                          <th style={{ padding: '8px 12px' }}>First In</th>
                          <th style={{ padding: '8px 12px' }}>Working Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.employees.map(emp => {
                          const isSelected = bulkSelectedIds.has(emp.employee_id);
                          const isOnDuty = emp.status === 'On Duty';
                          return (
                            <tr
                              key={emp.employee_id}
                              onClick={() => {
                                const next = new Set(bulkSelectedIds);
                                if (next.has(emp.employee_id)) next.delete(emp.employee_id);
                                else next.add(emp.employee_id);
                                setBulkSelectedIds(next);
                              }}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? '#fff7ed' : 'transparent',
                                transition: 'background-color 0.15s'
                              }}
                            >
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by row click
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0f172a' }}>
                                {emp.name}
                                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>{emp.employee_id}</div>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#475569' }}>
                                {emp.department || 'General'}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  backgroundColor: isOnDuty ? '#ecfdf5' : (emp.status === 'Checked Out' ? '#f1f5f9' : '#fff1f2'),
                                  color: isOnDuty ? '#047857' : (emp.status === 'Checked Out' ? '#475569' : '#991b1b')
                                }}>
                                  {emp.status}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: '600' }}>
                                {emp.first_in ? emp.first_in.slice(11, 16) : '—'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#047857', fontWeight: '700' }}>
                                {emp.working_str || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Will apply departure at <strong style={{ color: '#c2410c' }}>{bulkTime}</strong> for <strong style={{ color: '#0f172a' }}>{bulkSelectedIds.size} staff member(s)</strong>.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  disabled={bulkLoading}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkCheckoutSubmit}
                  disabled={bulkLoading || bulkSelectedIds.size === 0}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: bulkSelectedIds.size === 0 ? '#cbd5e1' : '#ea580c',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '13px',
                    cursor: (bulkLoading || bulkSelectedIds.size === 0) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  {bulkLoading ? 'Processing Bulk Check-Out...' : `Apply Bulk Check-Out (${bulkSelectedIds.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT EMPLOYEE PROFILE & RESTRICTED ZONE PERMISSIONS               */}
      {/* ========================================================================= */}
      {editingEmployeeModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: '#991b1b'
                }}>
                  🚫
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                    Edit Profile & Zone Permissions
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Configure duty details & prohibited checkpoints for {editingEmployeeModal.id}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployeeModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEmployeeModal} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Employee ID & Photo Summary */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  backgroundColor: '#cbd5e1',
                  flexShrink: 0
                }}>
                  {editingEmployeeModal.photo_b64 || (editingEmployeeModal.crops && editingEmployeeModal.crops[0]) ? (
                    <img
                      src={(editingEmployeeModal.photo_b64 || editingEmployeeModal.crops[0]).startsWith('data:')
                        ? (editingEmployeeModal.photo_b64 || editingEmployeeModal.crops[0])
                        : `data:image/jpeg;base64,${editingEmployeeModal.photo_b64 || editingEmployeeModal.crops[0]}`}
                      alt={editingEmployeeModal.id}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: '#64748b' }}>
                      {(editingEmployeeModal.name || editingEmployeeModal.id).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                    {editingEmployeeModal.name || editingEmployeeModal.display_name || editingEmployeeModal.id}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    ID: <span style={{ fontWeight: '700', color: '#0284c7' }}>{editingEmployeeModal.id}</span> • {editingEmployeeModal.is_enrolled ? 'Enrolled Staff' : 'Auto ID'}
                  </div>
                </div>
              </div>

              {/* Name Field */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  Staff Full Name
                </label>
                <input
                  type="text"
                  value={editEmployeeForm.name}
                  onChange={e => setEditEmployeeForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Viswa Kumar"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Biometric Face Angles & Image Management Section */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}>
                <input
                  type="file"
                  ref={editAddPhotoInputRef}
                  onChange={(e) => handleEditModalUploadPhotos(e, 'add')}
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  style={{ display: 'none' }}
                />
                <input
                  type="file"
                  ref={editReplacePhotoInputRef}
                  onChange={(e) => handleEditModalUploadPhotos(e, 'replace')}
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#0369a1' }}>
                      Face Biometrics ({editEmployeeCrops.length}/6 Angles)
                    </span>
                    {isEditPhotoLoading && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#0284c7', fontWeight: '700' }}>
                        <LoadingSpinner size={11} color="#0284c7" />
                        <span>Syncing AI...</span>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => editAddPhotoInputRef.current && editAddPhotoInputRef.current.click()}
                      disabled={editEmployeeCrops.length >= 6 || isEditPhotoLoading}
                      title={editEmployeeCrops.length >= 6 ? "Max 6 angle captures reached. Delete an angle to add another." : "Add new angle photo"}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: '700',
                        borderRadius: '6px',
                        border: '1px solid #bae6fd',
                        backgroundColor: editEmployeeCrops.length >= 6 ? '#f1f5f9' : '#e0f2fe',
                        color: editEmployeeCrops.length >= 6 ? '#94a3b8' : '#0284c7',
                        cursor: editEmployeeCrops.length >= 6 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      + Add Angle
                    </button>
                    <button
                      type="button"
                      onClick={() => editReplacePhotoInputRef.current && editReplacePhotoInputRef.current.click()}
                      disabled={isEditPhotoLoading}
                      title="Replace all existing photos with new photos"
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: '700',
                        borderRadius: '6px',
                        border: '1px solid #fed7aa',
                        backgroundColor: '#ffedd5',
                        color: '#c2410c',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Replace All
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {editEmployeeCrops.length === 0 ? (
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                      No angle photos registered. Click "+ Add Angle" above to upload photos.
                    </div>
                  ) : (
                    editEmployeeCrops.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          position: 'relative',
                          width: '44px',
                          height: '44px'
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: idx === 0 ? '2px solid #0284c7' : '1px solid #cbd5e1',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                        >
                          <img
                            src={c.startsWith('data:') ? c : `data:image/jpeg;base64,${c}`}
                            alt={`Angle ${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditModalDeleteCrop(idx);
                          }}
                          title={`Delete Angle #${idx + 1}`}
                          style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            backgroundColor: '#ef4444',
                            color: '#ffffff',
                            border: '1.5px solid #ffffff',
                            fontSize: '9px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontWeight: '900',
                            padding: 0,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            zIndex: 2
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Department & Designation Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Department
                  </label>
                  <select
                    value={editEmployeeForm.department}
                    onChange={e => setEditEmployeeForm(p => ({ ...p, department: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      backgroundColor: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Role / Designation
                  </label>
                  <input
                    type="text"
                    value={editEmployeeForm.designation}
                    onChange={e => setEditEmployeeForm(p => ({ ...p, designation: e.target.value }))}
                    placeholder="e.g. OT Technician"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* RESTRICTED CAMERAS CHECKPOINTS SECTION */}
              <div style={{
                marginTop: '6px',
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: '#fff',
                border: '1.5px solid #fecdd3'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '16px' }}>🚫</span>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#991b1b' }}>
                    Restricted Access Camera Checkpoints
                  </div>
                </div>
                <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#64748b' }}>
                  Select the checkpoints where this employee is prohibited from entering. If spotted on these cameras, their CCTV bounding box will be marked in red and an intrusion event will be logged.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {availableCameras.map(cam => {
                    const isRestricted = (editEmployeeForm.restricted_cameras || []).includes(cam.id) || (editEmployeeForm.restricted_cameras || []).includes(cam.name);
                    return (
                      <div
                        key={cam.id}
                        onClick={() => toggleRestrictedCamera(cam.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px',
                          borderRadius: '8px',
                          border: `1.5px solid ${isRestricted ? '#ef4444' : '#e2e8f0'}`,
                          backgroundColor: isRestricted ? '#fef2f2' : '#f8fafc',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isRestricted}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#dc2626' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '800', color: isRestricted ? '#991b1b' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {cam.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              backgroundColor: isRestricted ? '#fee2e2' : '#e2e8f0',
                              color: isRestricted ? '#b91c1c' : '#64748b'
                            }}>
                              {isRestricted ? '🚫 PROHIBITED' : '✓ Permitted'}
                            </span>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                              {cam.location || cam.role}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '10px',
                paddingTop: '14px',
                borderTop: '1px solid #e2e8f0'
              }}>
                <button
                  type="button"
                  onClick={() => setEditingEmployeeModal(null)}
                  disabled={savingEmployeeEdit}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#fff',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEmployeeEdit}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: savingEmployeeEdit ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
                  }}
                >
                  {savingEmployeeEdit ? 'Saving Changes...' : 'Save Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Centralized Alert Email Dispatch Modal */}
      <DispatchAlertEmailModal
        isOpen={Boolean(emailAlertModalData)}
        onClose={() => setEmailAlertModalData(null)}
        alertData={emailAlertModalData}
      />
    </div>
  );
}
