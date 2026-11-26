import React, { useState, useEffect, useRef } from 'react';
import { LoadingSpinner, LoadingOverlay } from './LoadingSpinner';

const PERIOD_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Past 7 Days',
  '30d': 'Past 30 Days'
};

export default function DepartmentAttendanceCard({ period = 'today', orgId = 'medanta', refreshTick = 0 }) {
  const [deptData, setDeptData] = useState([]);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);

  const activePeriod = (period || 'today').toLowerCase();
  const periodLabel = PERIOD_LABELS[activePeriod] || 'Today';

  useEffect(() => {
    let isMounted = true;

    const fetchDeptAttendance = async (isSilent = false) => {
      const reqId = ++reqIdRef.current;
      if (!isSilent && isMounted) {
        setLoading(true);
      }
      try {
        const res = await fetch(
          `/api/department-attendance?range=${encodeURIComponent(activePeriod)}&org_id=${encodeURIComponent(orgId || '')}&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted && reqId === reqIdRef.current && Array.isArray(data)) {
            setDeptData(data);
          }
        }
      } catch (err) {
        console.error('Failed to load department attendance:', err);
      } finally {
        if (isMounted && reqId === reqIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchDeptAttendance(false);
    const interval = setInterval(() => fetchDeptAttendance(true), 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activePeriod, orgId, refreshTick]);

  // Aggregate totals dynamically from database rows
  const totalEnrolled = deptData.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const totalPresent = deptData.reduce((acc, r) => acc + (Number(r.present) || 0), 0);
  const overallPct = totalEnrolled > 0 ? (Math.round((totalPresent / totalEnrolled) * 1000) / 10) : 0;

  return (
    <div
      className="med-card"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '24px',
        border: '1px solid #e2e8f0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3
            style={{
              fontSize: '18px',
              fontWeight: '800',
              color: '#0f172a',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            Department-wise Attendance ({periodLabel})
          </h3>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '700',
              color: '#64748b',
              backgroundColor: '#f1f5f9',
              padding: '2px 8px',
              borderRadius: '6px'
            }}
          >
            {deptData.length} Departments
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loading && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                fontWeight: '700',
                color: '#0369a1',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                padding: '4px 10px',
                borderRadius: '999px',
              }}
            >
              <LoadingSpinner size={12} color="#0284c7" />
              Loading {periodLabel}...
            </span>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#15803d',
              backgroundColor: '#dcfce7',
              padding: '4px 10px',
              borderRadius: '999px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#16a34a',
                display: 'inline-block',
              }}
            />
            Live Tracking
          </span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', position: 'relative', minHeight: loading ? '150px' : undefined }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: '0',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: '#f8fafc',
              }}
            >
              <th
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#334155',
                  borderTopLeftRadius: '8px',
                  borderBottomLeftRadius: '8px',
                  width: '32%',
                }}
              >
                Department
              </th>
              <th
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#334155',
                  textAlign: 'center',
                  width: '16%',
                }}
              >
                Total
              </th>
              <th
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#334155',
                  textAlign: 'center',
                  width: '16%',
                }}
              >
                Present
              </th>
              <th
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#334155',
                  borderTopRightRadius: '8px',
                  borderBottomRightRadius: '8px',
                  width: '36%',
                }}
              >
                Attendance
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && deptData.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding: '36px 24px', textAlign: 'center' }}>
                  <LoadingSpinner
                    size={30}
                    layout="stacked"
                    label={`Loading ${periodLabel} department attendance...`}
                    sublabel="Querying database records"
                  />
                </td>
              </tr>
            ) : deptData.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No department attendance records found for this period.
                </td>
              </tr>
            ) : (
              deptData.map((row, idx) => (
                <tr
                  key={row.department || idx}
                  style={{
                    borderBottom: idx === deptData.length - 1 ? 'none' : '1px solid #f1f5f9',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td
                    style={{
                      padding: '12px 16px',
                      fontSize: '13.5px',
                      fontWeight: '600',
                      color: '#1e293b',
                    }}
                  >
                    {row.department}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      fontSize: '13.5px',
                      fontWeight: '700',
                      color: '#0f172a',
                      textAlign: 'center',
                    }}
                  >
                    {Number(row.total).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      fontSize: '13.5px',
                      fontWeight: '700',
                      color: '#0f172a',
                      textAlign: 'center',
                    }}
                  >
                    {Number(row.present).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          maxWidth: '170px',
                          height: '9px',
                          backgroundColor: '#e2e8f0',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                            backgroundColor: row.percentage >= 80 ? '#16a34a' : row.percentage >= 50 ? '#d97706' : '#e11d48',
                            borderRadius: '999px',
                            transition: 'width 0.4s ease-in-out',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: '700',
                          color: '#0f172a',
                          minWidth: '46px',
                          textAlign: 'right',
                        }}
                      >
                        {Number(row.percentage).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {deptData.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                  Total Staff
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
                  {totalEnrolled.toLocaleString()}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
                  {totalPresent.toLocaleString()}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#16a34a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, maxWidth: '170px', height: '9px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, overallPct))}%`, backgroundColor: '#16a34a', borderRadius: '999px' }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '800', minWidth: '46px', textAlign: 'right' }}>
                      {overallPct.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        <LoadingOverlay
          visible={loading && deptData.length > 0}
          spinnerSize={28}
          message={`Loading ${periodLabel} department records...`}
          subtext="Querying database"
        />
      </div>
    </div>
  );
}
