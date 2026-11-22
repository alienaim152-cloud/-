import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  Timer,
  Trash2,
  TrendingUp,
  User,
} from 'lucide-react';
import type { BreakLogRecord, BreakType, EmployeePublic, IndividualStatsResponse } from '../types';
import {
  formatBangkokTime,
  formatDurationClock,
  formatDurationThai,
  formatThaiDateLabel,
  formatThaiMonthLabel,
  getBreakTypeShortLabel,
  getEmployeeStatusMeta,
  getStatusMeta,
} from '../utils/timeUtils';
import { exportIndividualStatsReport } from '../utils/exportUtils';

interface IndividualEmployeeDashboardProps {
  employeeCode: string;
  month: string;
  onMonthChange?: (nextMonth: string) => void;
  serverTimeOffsetMs: number;
  employeesList?: EmployeePublic[];
  onSelectEmployee?: (code: string) => void;
  onBack?: () => void;
  onCloseModal?: () => void;
  canClearData?: boolean;
  onDataCleared?: () => void;
  realtimeSignal?: number;
  compactHeader?: boolean;
}

export function IndividualEmployeeDashboard({
  employeeCode,
  month,
  onMonthChange,
  serverTimeOffsetMs,
  employeesList = [],
  onSelectEmployee,
  onBack,
  canClearData = true,
  onDataCleared,
  realtimeSignal = 0,
}: IndividualEmployeeDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [stats, setStats] = useState<IndividualStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tickNow, setTickNow] = useState(Date.now());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Interactive log filters on the personal dashboard
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_time' | 'grace' | 'overtime'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | BreakType>('all');

  useEffect(() => {
    setSelectedMonth(month);
  }, [month]);

  useEffect(() => {
    setConfirmClear(false);
    setSelectedDateFilter(null);
    setStatusFilter('all');
    setTypeFilter('all');
  }, [employeeCode]);

  const loadStats = useCallback(async (code: string, targetMonth: string, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/public/employee/${encodeURIComponent(code)}?month=${encodeURIComponent(targetMonth)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลดสถิติการลงเวลาของพนักงานได้');
      setStats(data as IndividualStatsResponse);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!employeeCode) return;
    const isSameSelection =
      stats?.employee.employee_code === employeeCode && stats?.month === selectedMonth;
    loadStats(employeeCode, selectedMonth, isSameSelection);
  }, [employeeCode, selectedMonth, realtimeSignal, loadStats]);

  useEffect(() => {
    if (!stats?.active_break) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stats?.active_break]);

  const handleMonthUpdate = (nextMonth: string) => {
    setSelectedMonth(nextMonth);
    setSelectedDateFilter(null);
    onMonthChange?.(nextMonth);
  };

  const handleClearEmployeeStats = async () => {
    if (!employeeCode) return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/admin/clear?scope=employee&employee_code=${encodeURIComponent(employeeCode)}&month=${encodeURIComponent(selectedMonth)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ล้างสถิติพนักงานไม่สำเร็จ');
        return;
      }
      setConfirmClear(false);
      await loadStats(employeeCode, selectedMonth);
      onDataCleared?.();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setClearing(false);
    }
  };

  const handleForceEndSingleLog = async (logId: number) => {
    try {
      const res = await fetch(`/api/admin/logs/${logId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_end: true }),
      });
      if (res.ok) {
        await loadStats(employeeCode, selectedMonth);
        onDataCleared?.();
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  const handleDeleteSingleLog = async (logId: number) => {
    try {
      const res = await fetch(`/api/admin/logs/${logId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadStats(employeeCode, selectedMonth);
        onDataCleared?.();
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  const filteredLogs = useMemo(() => {
    if (!stats) return [];
    return stats.recent_logs.filter((log) => {
      if (selectedDateFilter && log.work_date !== selectedDateFilter) return false;
      if (statusFilter === 'on_time' && log.status !== 'on_time') return false;
      if (statusFilter === 'grace' && log.status !== 'grace') return false;
      if (
        statusFilter === 'overtime' &&
        log.status !== 'overtime' &&
        log.violation_recorded !== 1
      ) {
        return false;
      }
      if (typeFilter !== 'all' && log.break_type !== typeFilter) return false;
      return true;
    });
  }, [stats, selectedDateFilter, statusFilter, typeFilter]);

  const maxDailyMin = useMemo(() => {
    if (!stats || stats.daily_series.length === 0) return 60;
    return Math.max(30, ...stats.daily_series.map((d) => d.total_minutes));
  }, [stats]);

  // SVG Donut math for Break Types
  const donutMetrics = useMemo(() => {
    const b1 = stats?.summary.break_1_count || 0;
    const b2 = stats?.summary.break_2_count || 0;
    const q = stats?.summary.quick_out_count || 0;
    const total = Math.max(1, b1 + b2 + q);
    const b1Pct = (b1 / total) * 100;
    const b2Pct = (b2 / total) * 100;
    const qPct = (q / total) * 100;
    const radius = 48;
    const circumference = 2 * Math.PI * radius;
    return { b1, b2, q, totalRaw: b1 + b2 + q, b1Pct, b2Pct, qPct, radius, circumference };
  }, [stats]);

  const activeLiveInfo = useMemo(() => {
    if (!stats?.active_break) return null;
    const ab = stats.active_break;
    const elapsed = Math.max(
      0,
      Math.floor((tickNow + serverTimeOffsetMs - new Date(ab.start_time).getTime()) / 1000)
    );
    const allowedSec = ab.allowed_minutes * 60;
    const maxWithGraceSec = (ab.allowed_minutes + ab.grace_minutes) * 60;
    const progressPct = Math.min(100, Math.round((elapsed / Math.max(1, maxWithGraceSec)) * 100));
    const isOverGrace = elapsed > maxWithGraceSec;
    const isInGrace = !isOverGrace && elapsed > allowedSec;
    return { elapsed, allowedSec, maxWithGraceSec, progressPct, isOverGrace, isInGrace, ab };
  }, [stats?.active_break, tickNow, serverTimeOffsetMs]);

  const empStatusMeta = stats ? getEmployeeStatusMeta(stats.employee.status) : null;

  return (
    <div className="space-y-5">
      {/* Top Hero Header Card */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mt-0.5 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                รายชื่อพนักงาน
              </button>
            )}

            <div className="w-12 h-12 rounded-2xl bg-sky-600/15 border border-sky-600/25 flex items-center justify-center text-sky-700 shrink-0">
              <User className="w-6 h-6" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-sky-600/15 border border-sky-600/25 font-mono-tabular text-xs font-bold text-sky-800">
                  {employeeCode}
                </span>
                {empStatusMeta && (
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${empStatusMeta.bgClass} ${empStatusMeta.textClass} ${empStatusMeta.borderClass}`}
                  >
                    {empStatusMeta.shortLabel}
                  </span>
                )}
                {activeLiveInfo ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-sky-600 text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    กำลังพักอยู่ขณะนี้
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-medium bg-white/75 border border-slate-300/60 text-slate-700">
                    Dashboard สถิติการลงเวลา
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 truncate">
                {stats?.employee.full_name || 'กำลังโหลดข้อมูลพนักงาน...'}
                {stats?.employee.nickname && (
                  <span className="text-base font-medium text-slate-500 ml-2">
                    ({stats.employee.nickname})
                  </span>
                )}
              </h2>

              {stats && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
                  <span>
                    แผนก: <strong className="text-slate-900">{stats.employee.department}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ตำแหน่ง: <strong className="text-slate-900">{stats.employee.position}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ประจำเดือน:{' '}
                    <strong className="text-sky-800">{formatThaiMonthLabel(stats.month)}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {employeesList.length > 0 && onSelectEmployee && (
              <select
                aria-label="สลับดูสถิติพนักงานคนอื่น"
                value={employeeCode}
                onChange={(e) => onSelectEmployee(e.target.value)}
                className="px-3 py-2 rounded-xl liquid-glass-input text-xs font-semibold text-slate-900 focus:outline-none max-w-[220px]"
              >
                {employeesList.map((emp) => (
                  <option key={emp.employee_code} value={emp.employee_code}>
                    {emp.employee_code} · {emp.full_name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => handleMonthUpdate(e.target.value)}
              className="px-3 py-2 rounded-xl liquid-glass-input text-xs text-slate-900 font-mono-tabular focus:outline-none"
            />

            {stats && (
              <>
                <button
                  type="button"
                  onClick={() => exportIndividualStatsReport(stats, 'xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportIndividualStatsReport(stats, 'csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                {canClearData && (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างสถิติพนักงานนี้
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Inline Clear Confirmation Banner */}
        {confirmClear && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-rose-900">
              ยืนยันการล้างบันทึกเวลาพักของ {employeeCode} ในเดือน{' '}
              {formatThaiMonthLabel(selectedMonth)} ทั้งหมดใช่หรือไม่? (Admin)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium liquid-glass-card text-slate-700 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearEmployeeStats}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
              >
                {clearing ? 'กำลังล้างข้อมูล...' : 'ยืนยันล้างสถิติ'}
              </button>
            </div>
          </div>
        )}

        {/* Active Live Break Monitor Banner */}
        {activeLiveInfo && (
          <div
            className={`p-4 rounded-2xl border ${
              activeLiveInfo.isOverGrace
                ? 'bg-rose-500/15 border-rose-500/40'
                : activeLiveInfo.isInGrace
                ? 'bg-amber-500/15 border-amber-500/40'
                : 'bg-sky-500/15 border-sky-500/35'
            } space-y-2.5`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Timer
                  className={`w-5 h-5 ${
                    activeLiveInfo.isOverGrace
                      ? 'text-rose-700'
                      : activeLiveInfo.isInGrace
                      ? 'text-amber-700'
                      : 'text-sky-700'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    กำลังลงเวลาพักอยู่ขณะนี้ (Real-Time)
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {getBreakTypeShortLabel(activeLiveInfo.ab.break_type)} · เริ่มเวลา{' '}
                    {formatBangkokTime(activeLiveInfo.ab.start_time)} (สิทธิ์{' '}
                    {activeLiveInfo.ab.allowed_minutes} นาที
                    {activeLiveInfo.ab.grace_minutes > 0
                      ? ` + อนุโลม ${activeLiveInfo.ab.grace_minutes} นาที`
                      : ''}
                    )
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono-tabular text-2xl font-bold ${
                    activeLiveInfo.isOverGrace
                      ? 'text-rose-700'
                      : activeLiveInfo.isInGrace
                      ? 'text-amber-800'
                      : 'text-slate-900'
                  }`}
                >
                  {formatDurationClock(activeLiveInfo.elapsed)}
                </div>
                <div className="text-[11px] font-semibold text-slate-600">
                  {activeLiveInfo.isOverGrace
                    ? 'เกินเวลาอนุโลมแล้ว'
                    : activeLiveInfo.isInGrace
                    ? 'อยู่ในช่วงอนุโลม ≤ 5 นาที'
                    : 'อยู่ในเวลาพักปกติ'}
                </div>
              </div>
            </div>
            <div className="h-2 rounded-full bg-white/70 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeLiveInfo.isOverGrace
                    ? 'bg-rose-600'
                    : activeLiveInfo.isInGrace
                    ? 'bg-amber-500'
                    : 'bg-sky-600'
                }`}
                style={{ width: `${activeLiveInfo.progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading / Error State */}
      {loading && !stats ? (
        <div className="liquid-glass rounded-3xl py-16 text-center text-sm font-medium text-slate-600">
          กำลังประมวลผล Dashboard สถิติการลงเวลา...
        </div>
      ) : error ? (
        <div className="liquid-glass rounded-3xl p-8 text-center text-sm font-semibold text-rose-800 bg-rose-500/15 border border-rose-500/35">
          {error}
        </div>
      ) : stats ? (
        <>
          {/* Top 4 Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="liquid-glass rounded-2xl p-5"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
                <span>จำนวนครั้งที่ลงเวลาพัก</span>
                <CalendarDays className="w-4 h-4 text-sky-600" />
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-slate-900 mt-2">
                {stats.summary.total_breaks}{' '}
                <span className="text-sm font-normal text-slate-500">ครั้ง</span>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-300/60 text-xs text-slate-600 flex items-center justify-between">
                <span>ลงเวลา {stats.summary.active_days} วันทำการ</span>
                <span className="font-mono-tabular font-semibold text-sky-800">
                  เฉลี่ย {stats.summary.avg_breaks_per_day} ครั้ง/วัน
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.04 }}
              className="liquid-glass rounded-2xl p-5"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
                <span>อัตราตรงต่อเวลา</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-emerald-700 mt-2">
                {stats.summary.punctuality_rate}%
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-300/60 text-xs text-slate-600 flex items-center justify-between">
                <span>ตรงเวลา {stats.summary.on_time_count} ครั้ง</span>
                <span className="font-semibold text-amber-700">
                  อนุโลม {stats.summary.grace_count} ครั้ง
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.08 }}
              className="liquid-glass rounded-2xl p-5"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
                <span>เวลาพักรวมทั้งเดือน</span>
                <Clock className="w-4 h-4 text-sky-600" />
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-sky-800 mt-2">
                {stats.summary.total_minutes}{' '}
                <span className="text-sm font-normal text-slate-500">นาที</span>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-300/60 text-xs text-slate-600 flex items-center justify-between">
                <span>เฉลี่ย {stats.summary.avg_minutes} นาที/ครั้ง</span>
                <span className="font-mono-tabular font-semibold text-slate-800">
                  นานสุด {formatDurationThai(stats.summary.max_duration_seconds)}
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.12 }}
              className="liquid-glass rounded-2xl p-5"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
                <span>เกินเกณฑ์ 5 นาที</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-rose-700 mt-2">
                {stats.summary.overtime_count}{' '}
                <span className="text-sm font-normal text-slate-500">ครั้ง</span>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-300/60 text-xs text-slate-600 flex items-center justify-between">
                <span>วันนี้ลงเวลา {stats.summary.today_breaks_count} ครั้ง</span>
                <span className="font-mono-tabular font-semibold text-rose-700">
                  เกินสะสม {Math.round(stats.summary.total_exceeded_seconds / 60)} นาที
                </span>
              </div>
            </motion.div>
          </div>

          {/* Today's Clock-In / Clock-Out Summary */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">
                  การลงเวลาพักวันนี้ ({formatThaiDateLabel(stats.today_date)})
                </h3>
              </div>
              <span className="text-xs font-semibold text-sky-800 bg-sky-500/15 border border-sky-500/25 px-2.5 py-1 rounded-lg">
                รวม {stats.today_logs.length} รอบวันนี้
              </span>
            </div>

            {stats.today_logs.length === 0 ? (
              <div className="liquid-glass-card rounded-2xl p-4 text-center text-xs text-slate-500">
                พนักงานท่านนี้ยังไม่มีประวัติการลงเวลาพักในวันนี้
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {stats.today_logs.map((log: BreakLogRecord) => {
                  const st = getStatusMeta(log.status);
                  const liveSec =
                    log.status === 'active'
                      ? Math.max(
                          0,
                          Math.floor(
                            (tickNow + serverTimeOffsetMs - new Date(log.start_time).getTime()) / 1000
                          )
                        )
                      : log.duration_seconds;
                  return (
                    <div
                      key={log.id}
                      className="liquid-glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900">
                          {getBreakTypeShortLabel(log.break_type)}
                        </div>
                        <div className="font-mono-tabular text-xs text-slate-600 mt-0.5">
                          ออก {formatBangkokTime(log.start_time)} → เข้า{' '}
                          {log.status === 'active' ? 'กำลังพัก' : formatBangkokTime(log.end_time)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular text-xs font-bold text-slate-900 mb-1">
                          {log.status === 'active'
                            ? formatDurationClock(liveSec)
                            : formatDurationThai(liveSec)}
                        </div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${st.bgClass} ${st.textClass} ${st.borderClass}`}
                        >
                          {st.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Charts Row: Daily Trend Stacked Bar + Break Type Donut & Compliance */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Daily Trend Bar Chart */}
            <div className="xl:col-span-8 liquid-glass rounded-3xl p-5 sm:p-6 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-sky-600" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      กราฟเวลาพักรายวัน ({formatThaiMonthLabel(stats.month)})
                    </h3>
                    <p className="text-xs text-slate-600">
                      คลิกแท่งกราฟเพื่อกรองดูรายการลงเวลาของวันนั้น (หน่วย: นาที/วัน)
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                    ตรงเวลา
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                    อนุโลม ≤ 5น.
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                    เกิน 5 นาที
                  </span>
                </div>
              </div>

              {stats.daily_series.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">
                  ยังไม่มีประวัติการลงเวลาพักในเดือนนี้
                </div>
              ) : (
                <div className="flex items-end gap-2 h-52 pt-6 overflow-x-auto pb-2">
                  {stats.daily_series.map((d) => {
                    const totalMin = Math.max(0, d.total_minutes);
                    const barHeightPct = Math.max(10, Math.round((totalMin / maxDailyMin) * 100));
                    const sumSeg = Math.max(
                      1,
                      d.on_time_minutes + d.grace_minutes + d.overtime_minutes
                    );
                    const otPct = Math.round((d.overtime_minutes / sumSeg) * 100);
                    const grPct = Math.round((d.grace_minutes / sumSeg) * 100);
                    const onPct = Math.max(0, 100 - otPct - grPct);
                    const isSelected = selectedDateFilter === d.work_date;

                    return (
                      <button
                        key={d.work_date}
                        type="button"
                        onClick={() =>
                          setSelectedDateFilter((prev) =>
                            prev === d.work_date ? null : d.work_date
                          )
                        }
                        title={`${formatThaiDateLabel(d.work_date)}: ${d.total_minutes} นาที (${d.breaks_count} ครั้ง, เกินเวลา ${d.overtime_count} ครั้ง)`}
                        className={`flex-1 min-w-[38px] flex flex-col items-center gap-1.5 cursor-pointer group rounded-xl p-1 transition-colors ${
                          isSelected ? 'bg-sky-500/15 ring-1 ring-sky-600/40' : 'hover:bg-white/50'
                        }`}
                      >
                        <span className="font-mono-tabular text-[11px] font-semibold text-slate-700">
                          {d.total_minutes}
                        </span>
                        <div className="w-full max-w-[30px] h-36 bg-white/45 border border-white/65 rounded-t-lg flex items-end overflow-hidden shadow-inner">
                          <div
                            className="w-full flex flex-col justify-end transition-all"
                            style={{ height: `${barHeightPct}%` }}
                          >
                            {otPct > 0 && (
                              <div className="w-full bg-rose-500" style={{ height: `${otPct}%` }} />
                            )}
                            {grPct > 0 && (
                              <div className="w-full bg-amber-500" style={{ height: `${grPct}%` }} />
                            )}
                            {onPct > 0 && (
                              <div className="w-full bg-sky-500" style={{ height: `${onPct}%` }} />
                            )}
                          </div>
                        </div>
                        <span className="font-mono-tabular text-[11px] text-slate-600 group-hover:text-slate-900">
                          {d.work_date.slice(8)}/{d.work_date.slice(5, 7)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Break Type Breakdown Donut + Punctuality Bar */}
            <div className="xl:col-span-4 liquid-glass rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
              <div className="flex items-center gap-2.5">
                <Coffee className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">สัดส่วนประเภทการพัก</h3>
                  <p className="text-xs text-slate-600">จำนวนครั้งและเวลาเฉลี่ยต่อประเภท</p>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r={donutMetrics.radius}
                      fill="none"
                      stroke="rgba(148,163,184,0.22)"
                      strokeWidth="16"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={donutMetrics.radius}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="16"
                      strokeDasharray={`${(donutMetrics.b1Pct / 100) * donutMetrics.circumference} ${donutMetrics.circumference}`}
                      strokeDashoffset={0}
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={donutMetrics.radius}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="16"
                      strokeDasharray={`${(donutMetrics.b2Pct / 100) * donutMetrics.circumference} ${donutMetrics.circumference}`}
                      strokeDashoffset={-((donutMetrics.b1Pct / 100) * donutMetrics.circumference)}
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={donutMetrics.radius}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="16"
                      strokeDasharray={`${(donutMetrics.qPct / 100) * donutMetrics.circumference} ${donutMetrics.circumference}`}
                      strokeDashoffset={
                        -(((donutMetrics.b1Pct + donutMetrics.b2Pct) / 100) * donutMetrics.circumference)
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono-tabular text-2xl font-bold text-slate-900">
                      {donutMetrics.totalRaw}
                    </span>
                    <span className="text-[11px] text-slate-500">ครั้งรวม</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between liquid-glass-card rounded-xl px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-700 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-600" />
                    พักช่วงแรก (30 น.)
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {stats.summary.break_1_count} ครั้ง · เฉลี่ย {stats.summary.avg_break_1_minutes} น.
                  </span>
                </div>
                <div className="flex items-center justify-between liquid-glass-card rounded-xl px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-700 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                    พักช่วงที่สอง (60 น.)
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {stats.summary.break_2_count} ครั้ง · เฉลี่ย {stats.summary.avg_break_2_minutes} น.
                  </span>
                </div>
                <div className="flex items-center justify-between liquid-glass-card rounded-xl px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-700 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                    เข้า-ออกชั่วคราว (≤ 5 น.)
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {stats.summary.quick_out_count} ครั้ง · เฉลี่ย {stats.summary.avg_quick_out_minutes} น.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Personal Time-Clocking Log Table with Interactive Filters */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ประวัติการลงเวลาพักรายบุคคล ({filteredLogs.length} รายการ)
                </h3>
                {selectedDateFilter && (
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className="text-sky-800 font-semibold">
                      กำลังกรองวันที่: {formatThaiDateLabel(selectedDateFilter)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedDateFilter(null)}
                      className="text-rose-700 font-semibold hover:underline cursor-pointer"
                    >
                      ล้างวันที่
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl liquid-glass-card overflow-x-auto">
                  {[
                    { id: 'all' as const, label: 'ทุกสถานะ' },
                    { id: 'on_time' as const, label: 'ตรงเวลา' },
                    { id: 'grace' as const, label: 'อนุโลม ≤ 5น.' },
                    { id: 'overtime' as const, label: 'เกิน > 5น.' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        statusFilter === f.id
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="กรองประเภทเวลาพัก"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | BreakType)}
                  className="px-3 py-1.5 rounded-xl liquid-glass-input text-xs font-semibold text-slate-900 focus:outline-none"
                >
                  <option value="all">ทุกประเภทเวลาพัก</option>
                  <option value="break_1">พักช่วง 1 (30 น.)</option>
                  <option value="break_2">พักช่วง 2 (60 น.)</option>
                  <option value="quick_out">เข้า-ออกชั่วคราว (≤ 5 น.)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-2xl liquid-glass-table">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="liquid-glass-thead sticky top-0 text-xs text-slate-700 border-b border-white/60">
                  <tr>
                    <th className="py-2.5 px-3.5 font-semibold">วันที่</th>
                    <th className="py-2.5 px-3.5 font-semibold">ประเภทเวลาพัก</th>
                    <th className="py-2.5 px-3.5 font-semibold">เวลาออกพัก</th>
                    <th className="py-2.5 px-3.5 font-semibold">เวลากลับเข้างาน</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">ระยะเวลาที่ใช้</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">เวลาที่เกิน</th>
                    <th className="py-2.5 px-3.5 font-semibold">สถานะ</th>
                    <th className="py-2.5 px-3.5 font-semibold">หมายเหตุ</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500 text-xs">
                        ไม่พบประวัติการลงเวลาพักตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const st = getStatusMeta(log.status);
                      return (
                        <tr key={log.id} className="hover:bg-white/70 transition-colors">
                          <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                            {log.work_date}
                          </td>
                          <td className="py-2.5 px-3.5 text-xs text-slate-800 whitespace-nowrap">
                            {getBreakTypeShortLabel(log.break_type)}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                            {formatBangkokTime(log.start_time)}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                            {log.status === 'active' ? 'กำลังพัก' : formatBangkokTime(log.end_time)}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-right text-slate-900 font-semibold whitespace-nowrap">
                            {log.status === 'active'
                              ? 'กำลังพัก'
                              : formatDurationThai(log.duration_seconds)}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-right whitespace-nowrap">
                            {log.exceeded_seconds > 0 ? (
                              <span
                                className={
                                  log.violation_recorded
                                    ? 'text-rose-700 font-bold'
                                    : 'text-amber-700 font-semibold'
                                }
                              >
                                +{formatDurationThai(log.exceeded_seconds)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${st.bgClass} ${st.textClass} ${st.borderClass}`}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-xs text-slate-600 max-w-[200px] truncate">
                            {log.note || '—'}
                          </td>
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {log.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => handleForceEndSingleLog(log.id)}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                >
                                  ปิดรอบพัก
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleLog(log.id)}
                                className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-500/15 transition-colors cursor-pointer"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </>
      ) : null}
    </div>
  );
}
