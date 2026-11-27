import React, { useState, useEffect, useCallback, useRef } from 'react';
import KpiCards from './components/KpiCards';
import LiveHudFeed from './components/LiveHudFeed';
import TrafficTrendChart from './components/TrafficTrendChart';
import EmployeeRegistry from './components/EmployeeRegistry';
import CinematicThreatAlert from './components/CinematicThreatAlert';
import JourneyTimelineModal from './components/JourneyTimelineModal';
import DepartmentAttendanceCard from './components/DepartmentAttendanceCard';
import { LoadingSpinner } from './components/LoadingSpinner';
import { playTacticalChime } from './utils/alertSound';

export default function App() {
  const [clockTime, setClockTime] = useState(() => {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }) + ' IST');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [kpis, setKpis] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [activeCamera, setActiveCamera] = useState('staff');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedJourneyId, setSelectedJourneyId] = useState(null);
  const [trendRange, setTrendRange] = useState('today');
  const trendRangeRef = useRef('today');
  const [trendData, setTrendData] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoEnrollEnabled, setAutoEnrollEnabled] = useState(true);
  const [registrySection, setRegistrySection] = useState('details');
  const [loading, setLoading] = useState(true);
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isOrgLoading, setIsOrgLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const periodReqIdRef = useRef(0);
  const [orgs, setOrgs] = useState([]);

  // URL query parameter org locking (e.g. ?org=medanta or ?org_id=medanta)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlOrg = urlParams.get('org') || urlParams.get('org_id');
  const isOrgLocked = Boolean(urlOrg);
  const initialOrg = urlOrg || 'bellwether';

  const [activeOrgId, setActiveOrgId] = useState(initialOrg);
  const activeOrgIdRef = useRef(initialOrg);
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgIndustry, setNewOrgIndustry] = useState('Corporate');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isEditingOrgName, setIsEditingOrgName] = useState(false);
  const [editOrgName, setEditOrgName] = useState('');
  const [isSavingOrgName, setIsSavingOrgName] = useState(false);

  // Fetch KPI & status data
  const fetchData = useCallback(async () => {
    const reqRange = trendRangeRef.current || 'today';
    const reqOrg = activeOrgIdRef.current || 'bellwether';
    try {
      const ts = Date.now();
      const [kpiRes, camRes, trendRes, visRes, watchRes, alertRes, orgRes] = await Promise.all([
        fetch(`/api/kpis?range=${encodeURIComponent(reqRange)}&org_id=${encodeURIComponent(reqOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/cameras?org_id=${encodeURIComponent(reqOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/traffic-trend?range=${encodeURIComponent(reqRange)}&org_id=${encodeURIComponent(reqOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/visitors?limit=250&org_id=${encodeURIComponent(reqOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/watchlist?org_id=${encodeURIComponent(reqOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/alerts?org_id=${encodeURIComponent(reqOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/orgs?_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      ]);

      // Ignore stale responses if the user switched org mid-flight
      if (reqOrg !== (activeOrgIdRef.current || 'bellwether')) return;
      const periodStillMatches = reqRange === (trendRangeRef.current || 'today');

      if (kpiRes && periodStillMatches) {
        setKpis(kpiRes);
        if (typeof kpiRes.auto_enroll_enabled === 'boolean') {
          setAutoEnrollEnabled(kpiRes.auto_enroll_enabled);
        }
      }
      if (camRes?.cameras) {
        setCameras(camRes.cameras);
        if (camRes.active) {
          setActiveCamera(camRes.active);
        } else if (camRes.cameras.length > 0) {
          setActiveCamera(camRes.cameras[0].id);
        } else {
          setActiveCamera(null);
        }
      } else {
        setCameras([]);
        setActiveCamera(null);
      }
      if (trendRes && periodStillMatches) setTrendData(trendRes);
      if (visRes && Array.isArray(visRes)) setVisitors(visRes);
      if (watchRes) setWatchlist(watchRes);
      if (alertRes) setAlerts(alertRes);
      if (orgRes?.orgs) {
        setOrgs(orgRes.orgs);
        if (!isOrgLocked && orgRes.active_org_id && orgRes.active_org_id !== activeOrgIdRef.current && !localStorage.getItem('user_switched_org')) {
          const srvOrg = orgRes.active_org_id;
          setActiveOrgId(srvOrg);
          activeOrgIdRef.current = srvOrg;
        }
      }
    } catch (e) {
      console.error("Fetch data error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    setRefreshTick((t) => t + 1);
    try {
      await fetchData();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [fetchData]);

  // Listen to instantaneous custom refresh events triggered by feed clicks or manual actions
  useEffect(() => {
    const handleInstantRefresh = (e) => {
      const detail = e?.detail;
      if (detail && detail.action === 'blacklisted') {
        const vid = detail.visitor_id;
        const wid = detail.watchlist_id || `BLK-${Date.now().toString(16).toUpperCase()}`;
        const name = detail.name || `Target ${vid}`;
        const reason = detail.alert?.reason || 'Flagged via Live HUD Click';
        const photo = detail.alert?.photo_b64 || null;

        const newAlert = detail.alert || {
          id: `ALT-${Date.now().toString(16).toUpperCase()}`,
          watchlist_id: wid,
          person_name: name,
          reason: reason,
          camera_id: 'staff',
          camera_name: 'Staff Inbound Entry',
          confidence: 0.99,
          photo_b64: photo,
          timestamp: new Date().toISOString(),
          status: 'open'
        };

        const newWatchItem = {
          id: wid,
          name: name,
          alias: vid,
          category: 'visitor',
          reason: reason,
          photo_b64: photo,
          crops: photo ? [photo] : [],
          enrolled_at: new Date().toISOString()
        };

        setAlerts((prev) => [newAlert, ...(prev || []).filter(a => a.id !== newAlert.id)]);
        setWatchlist((prev) => [newWatchItem, ...(prev || []).filter(w => w.id !== newWatchItem.id)]);
        setVisitors((prev) => (prev || []).map(v =>
          (v.id === vid) ? { ...v, is_blacklisted: true, blacklist_reason: reason } : v
        ));
      } else if (detail && detail.action === 'removed') {
        const vid = detail.visitor_id;
        const wid = detail.watchlist_id;
        setWatchlist((prev) => (prev || []).filter(w =>
          (!vid || (w.alias !== vid && w.id !== vid)) &&
          (!wid || (w.id !== wid && w.alias !== wid))
        ));
        setAlerts((prev) => (prev || []).filter(a =>
          (!vid || (a.watchlist_id !== vid && a.person_name !== vid && !String(a.person_name || '').includes(vid))) &&
          (!wid || (a.watchlist_id !== wid && a.person_name !== wid && !String(a.person_name || '').includes(wid)))
        ));
        setVisitors((prev) => (prev || []).map(v =>
          (v.id === vid || v.id === wid) ? { ...v, is_blacklisted: false, blacklist_reason: null } : v
        ));
      }
      fetchData();
    };
    window.addEventListener('face-tracker-refresh', handleInstantRefresh);
    return () => window.removeEventListener('face-tracker-refresh', handleInstantRefresh);
  }, [fetchData]);

  const dismissedTargetsRef = useRef(new Set());

  // Connect to SSE real-time alert stream
  useEffect(() => {
    let evtSource = null;
    try {
      evtSource = new EventSource('/api/alerts/events');
      evtSource.addEventListener('alert', (e) => {
        try {
          const alertPayload = JSON.parse(e.data);
          const wid = alertPayload.watchlist_id ? String(alertPayload.watchlist_id).toLowerCase() : null;
          const name = alertPayload.person_name ? String(alertPayload.person_name).toLowerCase() : null;
          const aid = alertPayload.id ? String(alertPayload.id).toLowerCase() : null;

          if (
            (wid && dismissedTargetsRef.current.has(wid)) ||
            (name && dismissedTargetsRef.current.has(name)) ||
            (aid && dismissedTargetsRef.current.has(aid))
          ) {
            return;
          }

          if (soundEnabled) {
            playTacticalChime();
          }
          setActiveAlert(alertPayload);
          setAlerts((prev) => [alertPayload, ...(prev || []).filter(a => a.id !== alertPayload.id)]);
        } catch (err) {
          console.error("Error processing SSE alert event:", err);
        }
      });
      evtSource.onerror = () => {
        // SSE reconnect handles automatically
      };
    } catch (e) {
      console.warn("SSE stream unavailable:", e);
    }
    return () => {
      if (evtSource) {
        evtSource.close();
      }
    };
  }, [soundEnabled]);

  const handleDismissAlert = (targetIdOrName) => {
    if (targetIdOrName) {
      dismissedTargetsRef.current.add(String(targetIdOrName).toLowerCase());
      if (activeAlert?.watchlist_id) dismissedTargetsRef.current.add(String(activeAlert.watchlist_id).toLowerCase());
      if (activeAlert?.person_name) dismissedTargetsRef.current.add(String(activeAlert.person_name).toLowerCase());
      if (activeAlert?.id) dismissedTargetsRef.current.add(String(activeAlert.id).toLowerCase());

      fetch('/api/alerts/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlist_id: activeAlert?.watchlist_id,
          person_name: activeAlert?.person_name,
          id: activeAlert?.id
        })
      }).catch(() => { });
    }
    setActiveAlert(null);
  };

  // Periodic polling for KPIs and visitor logs
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSwitchCamera = async (camId) => {
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera: camId })
      });
      if (res.ok) {
        setActiveCamera(camId);
        fetchData();
      }
    } catch (e) {
      console.error("Switch camera error:", e);
    }
  };

  const handleAddCamera = async ({ name, location, rtsp, role }) => {
    try {
      const res = await fetch('/api/cameras/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location: location || name, rtsp, role: role || 'entry', org_id: activeOrgIdRef.current })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add camera');
      await fetchData();
      const newId = data.camera_id || data.camera?.id;
      if (newId) {
        await handleSwitchCamera(newId);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const handleRemoveCamera = async (camId) => {
    try {
      const res = await fetch('/api/cameras/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_id: camId, org_id: activeOrgIdRef.current })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove camera');
      if (data.active) setActiveCamera(data.active);
      await fetchData();
    } catch (e) {
      alert(`Error removing camera: ${e.message}`);
    }
  };

  const handleEditCamera = async ({ id, name, location, rtsp, role }) => {
    try {
      const res = await fetch('/api/cameras/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, location, rtsp, role, org_id: activeOrgIdRef.current })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to edit camera');
      await fetchData();
      return { success: true, camera: data.camera };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const handleTrendRangeChange = async (newRange) => {
    setTrendRange(newRange);
    trendRangeRef.current = newRange;
    const reqId = ++periodReqIdRef.current;
    const currentOrg = activeOrgIdRef.current || 'bellwether';
    setIsPeriodLoading(true);
    try {
      const ts = Date.now();
      const [trendRes, kpiRes] = await Promise.all([
        fetch(`/api/traffic-trend?range=${encodeURIComponent(newRange)}&org_id=${encodeURIComponent(currentOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch(`/api/kpis?range=${encodeURIComponent(newRange)}&org_id=${encodeURIComponent(currentOrg)}&_t=${ts}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      ]);
      if (reqId !== periodReqIdRef.current) return;
      if (Array.isArray(trendRes)) {
        setTrendData(trendRes);
      }
      if (kpiRes) {
        setKpis(kpiRes);
      }
    } catch (e) {
      console.error("Trend/KPI fetch error:", e);
    } finally {
      if (reqId === periodReqIdRef.current) {
        setIsPeriodLoading(false);
      }
    }
  };

  const handleBlacklist = async (personId, name, reason) => {
    const targetId = String(personId).trim();
    const targetName = name || targetId;
    const targetReason = reason || 'Security Watchlist Notification';
    const tempBlkId = `BLK-${Date.now().toString(16).toUpperCase()}`;

    const currentVis = (visitors || []).find(v => v.id === targetId);
    const photo = currentVis?.photo_b64 || (currentVis?.crops && currentVis.crops[0]) || null;
    const crops = currentVis?.crops || (photo ? [photo] : []);

    const newWatchItem = {
      id: tempBlkId,
      name: targetName,
      alias: targetId,
      category: 'visitor',
      reason: targetReason,
      photo_b64: photo,
      crops: crops,
      enrolled_at: new Date().toISOString()
    };

    setWatchlist((prev) => [newWatchItem, ...(prev || []).filter(w => w.id !== tempBlkId && w.alias !== targetId && w.id !== targetId)]);
    setVisitors((prev) => (prev || []).map(v =>
      (v.id === targetId) ? { ...v, is_blacklisted: true, blacklist_reason: targetReason } : v
    ));

    try {
      const res = await fetch('/api/blacklist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: targetId, name: targetName, reason: targetReason })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to blacklist');
      if (json.watchlist) setWatchlist(json.watchlist);
      await fetchData();
    } catch (err) {
      console.error("Blacklist add error:", err);
      await fetchData();
    }
  };

  const handleRemoveBlacklist = async (itemOrId) => {
    const wid = (typeof itemOrId === 'object' && itemOrId !== null) ? itemOrId.id : itemOrId;
    const alias = (typeof itemOrId === 'object' && itemOrId !== null) ? itemOrId.alias : null;
    const name = (typeof itemOrId === 'object' && itemOrId !== null) ? itemOrId.name : null;

    const targetIds = new Set([String(wid).trim()]);
    if (alias) targetIds.add(String(alias).trim());

    setWatchlist((prev) => (prev || []).filter(w =>
      !targetIds.has(w.id) && !targetIds.has(w.alias) && (!name || w.name !== name)
    ));
    setAlerts((prev) => (prev || []).filter(a =>
      !targetIds.has(a.watchlist_id) &&
      (!alias || (a.watchlist_id !== alias && a.person_name !== alias && !String(a.person_name || '').includes(alias)))
    ));
    setVisitors((prev) => (prev || []).map(v =>
      (targetIds.has(v.id) || (alias && v.id === alias) || v.id === wid) ? { ...v, is_blacklisted: false, blacklist_reason: null } : v
    ));

    try {
      const res = await fetch('/api/blacklist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist_id: wid, alias: alias, name: name })
      });
      const data = await res.json().catch(() => null);
      if (data && data.watchlist) {
        setWatchlist(data.watchlist);
      }
    } catch (err) {
      console.error("Failed to remove from blacklist:", err);
      fetchData();
    }
  };

  const handleEnrollManual = async (photoB64, name, reason) => {
    const res = await fetch('/api/blacklist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_b64: photoB64, name, reason, is_photo: true })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to enroll');
    await fetchData();
  };

  const handleRemoveCrop = async (visitorId, cropIndex, cropB64 = null) => {
    try {
      const res = await fetch('/api/visitors/remove-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, crop_index: cropIndex, crop_b64: cropB64 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove crop');
      await fetchData();
      return true;
    } catch (e) {
      alert(`Error removing crop: ${e.message}`);
      return false;
    }
  };

  const handleMergeProfiles = async (primaryId, mergeIds, excludedCrops = []) => {
    try {
      const res = await fetch('/api/visitors/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_id: primaryId, merge_ids: mergeIds, excluded_crops: excludedCrops })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to merge profiles');
      await fetchData();
      return true;
    } catch (e) {
      alert(`Error merging profiles: ${e.message}`);
      return false;
    }
  };

  const handleDeleteProfile = async (visitorId) => {
    if (!window.confirm(`Are you sure you want to delete profile ${visitorId}?`)) return;
    try {
      const res = await fetch('/api/visitors/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      alert(`Error deleting profile: ${e.message}`);
    }
  };

  const handleToggleGender = async (visitorId, newGender) => {
    try {
      const res = await fetch('/api/visitors/toggle-gender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, gender: newGender })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update gender');
      await fetchData();
      return true;
    } catch (e) {
      alert(`Error updating gender: ${e.message}`);
      return false;
    }
  };

  const handleFindSimilar = async (visitorId) => {
    try {
      const res = await fetch(`/api/visitors/similar?visitor_id=${encodeURIComponent(visitorId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to find similar profiles');
      return data;
    } catch (e) {
      alert(`Error finding similar profiles: ${e.message}`);
      return null;
    }
  };

  const handleTriggerTestAlert = async () => {
    try {
      if (soundEnabled) {
        playTacticalChime();
      }
      await fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Vikramaditya Rao',
          reason: 'Barred from OPD Premises (Past Disturbance)'
        })
      });
    } catch (e) {
      console.error("Test alert error:", e);
    }
  };

  const handleOpenWatchlist = () => {
    setRegistrySection('watchlist');
    const el = document.getElementById('employee-registry-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleToggleAutoEnroll = async () => {
    const nextVal = !autoEnrollEnabled;
    setAutoEnrollEnabled(nextVal);
    try {
      const res = await fetch('/api/settings/auto-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal, org_id: activeOrgId })
      });
      const data = await res.json();
      if (data && typeof data.auto_enroll_enabled === 'boolean') {
        setAutoEnrollEnabled(data.auto_enroll_enabled);
      }
      fetchData();
    } catch (e) {
      console.error("Toggle auto-enroll error:", e);
      setAutoEnrollEnabled(!nextVal);
    }
  };

  const handleOrgChange = async (newOrgId) => {
    setActiveOrgId(newOrgId);
    activeOrgIdRef.current = newOrgId;
    setVisitors([]); // Immediately clear previous org visitors to prevent state leakage
    setIsOrgLoading(true);
    try {
      await fetch('/api/orgs/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newOrgId })
      });
      await fetchData();
    } catch (e) {
      console.error('Org switch error:', e);
    } finally {
      setIsOrgLoading(false);
    }
  };

  const handleStartEditOrg = () => {
    const cur = orgs.find(o => o.id === activeOrgId);
    setEditOrgName(cur?.name || '');
    setIsEditingOrgName(true);
  };

  const handleSaveOrgRename = async () => {
    const trimmed = editOrgName.trim();
    if (!trimmed) {
      setIsEditingOrgName(false);
      return;
    }
    setIsSavingOrgName(true);
    try {
      const res = await fetch('/api/orgs/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeOrgId, name: trimmed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update organization name');
      if (data.orgs) setOrgs(data.orgs);
      setIsEditingOrgName(false);
      await fetchData();
    } catch (e) {
      alert(e.message || 'Error updating org name');
    } finally {
      setIsSavingOrgName(false);
    }
  };

  const handleCreateOrgSubmit = async (e) => {
    if (e) e.preventDefault();
    const name = newOrgName.trim();
    if (!name) return;
    setIsCreatingOrg(true);
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, industry: newOrgIndustry })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create organization');
      if (data.orgs) setOrgs(data.orgs);
      const newId = data.org?.id;
      if (newId) {
        await handleOrgChange(newId);
      }
      setShowAddOrgModal(false);
      setNewOrgName('');
    } catch (err) {
      alert(err.message || 'Error creating organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '24px 32px', maxWidth: '1720px', margin: '0 auto' }}>
      {/* Tactical Threat Alert Floating Card */}
      <CinematicThreatAlert
        alert={activeAlert}
        onDismiss={handleDismissAlert}
        soundEnabled={soundEnabled}
      />

      {/* Staff Cross-Camera Journey & 30-Day Attendance Modal */}
      <JourneyTimelineModal
        visitorId={selectedJourneyId}
        isOpen={Boolean(selectedJourneyId)}
        onClose={() => setSelectedJourneyId(null)}
        onDelete={handleDeleteProfile}
        onBlacklist={(vid) => {
          handleBlacklist(vid, null, 'Flagged from Journey Audit');
        }}
        onEmployeeUpdated={fetchData}
      />

      {/* Main Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              {orgs.find(o => o.id === activeOrgId)?.name || 'Staff Attendance Tracker'} — Attendance System
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '9999px',
              backgroundColor: '#ecfdf5',
              color: '#059669',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
              Live
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border-light)',
              color: '#059669',
              fontSize: '12px',
              fontWeight: '700',
              fontFamily: 'var(--font-mono)'
            }}>
              🟢 {clockTime}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Multi-camera biometric staff attendance · Automated identification · 30-day attendance analytics · Cross-camera movement intelligence
          </p>
        </div>

        {/* Header Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Org Selector & Management */}
          {isOrgLocked ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#ecfdf5',
              border: '1.5px solid #a7f3d0',
              padding: '5px 12px',
              borderRadius: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
              <span style={{ fontSize: '14px' }}>{activeOrgId === 'medanta' ? '🏥' : '🏢'}</span>
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#065f46' }}>
                {orgs.find(o => o.id === activeOrgId)?.name || (activeOrgId === 'medanta' ? 'Medanta Hospital' : activeOrgId)}
              </span>
            </div>
          ) : orgs.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#fff7ed',
              border: '1.5px solid #fed7aa',
              padding: '4px 10px',
              borderRadius: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
              <span style={{ fontSize: '14px' }}>🏢</span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#92400e' }}>Org:</span>
              {isOrgLoading && (
                <LoadingSpinner size={13} color="#ea580c" trackColor="rgba(234, 88, 12, 0.2)" />
              )}
              {isEditingOrgName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveOrgRename();
                      if (e.key === 'Escape') setIsEditingOrgName(false);
                    }}
                    autoFocus
                    placeholder="Enter org name"
                    style={{
                      border: '1px solid #ea580c',
                      backgroundColor: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '800',
                      color: '#c2410c',
                      borderRadius: '5px',
                      padding: '2px 6px',
                      outline: 'none',
                      width: '160px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveOrgRename}
                    disabled={isSavingOrgName}
                    title="Save Organization Name (Enter)"
                    style={{
                      background: '#16a34a',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer'
                    }}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingOrgName(false)}
                    title="Cancel (Esc)"
                    style={{
                      background: '#e2e8f0',
                      border: 'none',
                      color: '#475569',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <select
                    value={activeOrgId}
                    onChange={(e) => {
                      if (e.target.value === '__rename_active__') {
                        handleStartEditOrg();
                      } else {
                        handleOrgChange(e.target.value);
                      }
                    }}
                    style={{
                      border: 'none',
                      backgroundColor: 'transparent',
                      fontSize: '12px',
                      fontWeight: '800',
                      color: '#c2410c',
                      cursor: 'pointer',
                      outline: 'none',
                      padding: '2px 0',
                      maxWidth: '160px'
                    }}
                  >
                    {orgs.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                    <option value="__rename_active__">✏️ Rename current org...</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleStartEditOrg}
                    title="Edit / Rename Current Organization Name"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 3px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ea580c',
                      opacity: 0.85
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.85'}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddOrgModal(true)}
                    title="Create New Organization for Demo"
                    style={{
                      background: '#ea580c',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: '5px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      marginLeft: '2px',
                      boxShadow: '0 1px 2px rgba(234, 88, 12, 0.25)'
                    }}
                  >
                    <span>+</span> New
                  </button>
                </>
              )}
            </div>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextState = !soundEnabled;
              setSoundEnabled(nextState);
              if (nextState) {
                playTacticalChime();
              }
            }}
            title={soundEnabled ? 'Threat Alert Sound Enabled' : 'Threat Alert Sound Muted'}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: soundEnabled ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${soundEnabled ? '#bbf7d0' : 'var(--border-light)'}`,
              color: soundEnabled ? '#15803d' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <span>{soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}</span>
          </button>

          {/* Auto-Enrollment Stop/Resume Global Control */}
          <button
            type="button"
            onClick={handleToggleAutoEnroll}
            title={autoEnrollEnabled ? `Auto-Enrollment is Active for ${orgs.find(o => o.id === activeOrgId)?.name || 'this Organization'}. Click to Stop creating new profiles.` : `Auto-Enrollment is Stopped for ${orgs.find(o => o.id === activeOrgId)?.name || 'this Organization'}. Only existing profiles are checked. Click to Resume.`}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: autoEnrollEnabled ? '#ecfdf5' : '#fef2f2',
              border: `1.5px solid ${autoEnrollEnabled ? '#10b981' : '#ef4444'}`,
              color: autoEnrollEnabled ? '#065f46' : '#991b1b',
              fontSize: '12px',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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

          {/* Test Movie Alert Button */}
          <button
            type="button"
            onClick={handleTriggerTestAlert}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: '#fff1f2',
              border: '1px solid #fecdd3',
              color: '#e11d48',
              fontSize: '12px',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(225,29,72,0.1)'
            }}
          >
            <span>⚡ Test Alert HUD</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isManualRefreshing}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: isManualRefreshing ? '#f0f9ff' : '#ffffff',
              border: `1px solid ${isManualRefreshing ? '#bae6fd' : 'var(--border-light)'}`,
              color: isManualRefreshing ? '#0284c7' : 'var(--text-main)',
              fontSize: '12px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isManualRefreshing ? 'wait' : 'pointer'
            }}
          >
            {(isManualRefreshing || loading || isOrgLoading) ? (
              <LoadingSpinner size={14} color="#0284c7" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            )}
            <span>{isManualRefreshing ? 'Loading...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Top 4 Attendance KPI Cards */}
      <KpiCards
        kpis={kpis}
        period={trendRange}
        onDataRefresh={fetchData}
        orgId={activeOrgId}
        loading={loading || isPeriodLoading || isOrgLoading || isManualRefreshing}
      />

      {/* Dynamic Multi-Camera Main Stage (LiveHudFeed + TrafficTrendChart) */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
          <LiveHudFeed
            activeCamera={activeCamera}
            cameras={cameras}
            onSwitchCamera={handleSwitchCamera}
            onAddCamera={handleAddCamera}
            onEditCamera={handleEditCamera}
            onRemoveCamera={handleRemoveCamera}
            fps={kpis?.fps}
            isRtspConnected={kpis?.is_rtsp_connected}
            onOpenJourney={(id) => setSelectedJourneyId(id)}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onDataRefresh={fetchData}
            watchlistCount={watchlist.length}
            onOpenWatchlist={handleOpenWatchlist}
          />
          <TrafficTrendChart
            trendData={trendData}
            activeFilter={trendRange}
            onFilterChange={handleTrendRangeChange}
            loading={loading || isPeriodLoading || isOrgLoading || isManualRefreshing}
          />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: '24px',
          marginBottom: '24px'
        }}>
          <LiveHudFeed
            activeCamera={activeCamera}
            cameras={cameras}
            onSwitchCamera={handleSwitchCamera}
            onAddCamera={handleAddCamera}
            onEditCamera={handleEditCamera}
            onRemoveCamera={handleRemoveCamera}
            fps={kpis?.fps}
            isRtspConnected={kpis?.is_rtsp_connected}
            onOpenJourney={(id) => setSelectedJourneyId(id)}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onDataRefresh={fetchData}
            watchlistCount={watchlist.length}
            onOpenWatchlist={handleOpenWatchlist}
          />
          <TrafficTrendChart
            trendData={trendData}
            activeFilter={trendRange}
            onFilterChange={handleTrendRangeChange}
            loading={loading || isPeriodLoading || isOrgLoading || isManualRefreshing}
          />
        </div>
      )}

      {/* Department-wise Attendance */}
      <DepartmentAttendanceCard period={trendRange} orgId={activeOrgId} refreshTick={refreshTick} />

      {/* Employee Registry — compact management table */}
      <EmployeeRegistry
        visitors={visitors}
        cameras={cameras}
        onDataRefresh={fetchData}
        onSelectEmployee={(id) => setSelectedJourneyId(id)}
        autoEnrollEnabled={autoEnrollEnabled}
        onToggleAutoEnroll={handleToggleAutoEnroll}
        watchlist={watchlist}
        onBlacklist={handleBlacklist}
        onRemoveBlacklist={handleRemoveBlacklist}
        onEnrollManual={handleEnrollManual}
        onDeleteEmployee={handleDeleteProfile}
        activeSectionProp={registrySection}
        onSectionChange={setRegistrySection}
        activeOrgId={activeOrgId}
        isLoading={loading || isOrgLoading || isManualRefreshing}
      />

      {/* Add Organization Modal */}
      {showAddOrgModal && (
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
          onClick={() => setShowAddOrgModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🏢</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                    Create New Organization
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                    Set up a separate client organization workspace for demos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddOrgModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrgSubmit} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DLF CyberCity, Infosys Campus, Apollo Clinics"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
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
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                  Industry / Category:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { label: 'Corporate', value: 'Corporate' },
                    { label: 'Healthcare', value: 'Healthcare' },
                    { label: 'IT & Tech', value: 'Technology' },
                    { label: 'Manufacturing', value: 'Manufacturing' },
                    { label: 'Education', value: 'Education' },
                    { label: 'Retail', value: 'Retail' }
                  ].map((ind) => {
                    const isSel = newOrgIndustry === ind.value;
                    return (
                      <button
                        key={ind.value}
                        type="button"
                        onClick={() => setNewOrgIndustry(ind.value)}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: isSel ? '2px solid #ea580c' : '1px solid #e2e8f0',
                          backgroundColor: isSel ? '#fff7ed' : '#ffffff',
                          color: isSel ? '#ea580c' : '#475569',
                          fontWeight: isSel ? '800' : '600',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        {ind.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddOrgModal(false)}
                  disabled={isCreatingOrg}
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
                  type="submit"
                  disabled={isCreatingOrg || !newOrgName.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: isCreatingOrg ? 'wait' : 'pointer',
                    boxShadow: '0 1px 2px rgba(234, 88, 12, 0.3)'
                  }}
                >
                  {isCreatingOrg ? 'Creating...' : 'Create & Switch Org'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
