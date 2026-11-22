import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, User, Clock, AlertTriangle, CheckCircle2, BarChart3, Trash2 } from 'lucide-react';
import type { IndividualStatsResponse } from '../types';
import {
  formatBangkokTime,
  formatDurationClock,
  formatDurationThai,
  formatThaiDateLabel,
  formatThaiMonthLabel,
  getBreakTypeShortLabel,
  getStatusMeta,
} from '../utils/timeUtils';
import { exportIndividualStatsReport } from '../utils/exportUtils';

interface IndividualStatsModalProps {
  employeeCode: string | null;
  month: string;
  serverTimeOffsetMs: number;
  onClose: () => void;
  canClearData?: boolean;
  authToken?: string;
  onDataCleared?: () => void;
}

export function IndividualStatsModal({
  employeeCode,
  month,
  serverTimeOffsetMs,
  onClose,
  canClearData = false,
  authToken,
  onDataCleared,
}: IndividualStatsModalProps) {
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [stats, setStats] = useState<IndividualStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tickNow, setTickNow] = useState(Date.now());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setSelectedMonth(month);
    setConfirmClear(false);
  }, [month, employeeCode]);

  const loadStats = useCallback(async (code: string, targetMonth: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/public/employee/${encodeURIComponent(code)}?month=${encodeURIComponent(targetMonth)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลดสถิติพนักงานได้');
      setStats(data as IndividualStatsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!employeeCode) return;
    loadStats(employeeCode, selectedMonth);
  }, [employeeCode, selectedMonth, loadStats]);

  useEffect(() => {
    if (!stats?.active_break) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stats?.active_break]);

  const handleClearEmployeeStats = async () => {
    if (!employeeCode || !authToken) return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/admin/clear?scope=employee&employee_code=${encodeURIComponent(employeeCode)}&month=${encodeURIComponent(selectedMonth)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        }
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

  const maxDailyMin = Math.max(30, ...(stats?.daily_series.map((d) => d.total_minutes) || [30]));

  return (
    <AnimatePresence>
      {employeeCode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[90vh] flex flex-col liquid-glass-strong rounded-3xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white/50 border-b border-slate-300/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-600/15 border border-sky-600/25 flex items-center justify-center text-sky-700">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
                    <span>สถิติรายบุคคล</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{employeeCode}</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {stats?.employee.full_name || 'กำลังโหลดข้อมูล...'}
                  </h2>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-xl liquid-glass-input text-xs text-slate-900 font-mono-tabular focus:outline-none"
                />
                {stats && (
                  <>
                    <button
                      type="button"
                      onClick={() => exportIndividualStatsReport(stats, 'xlsx')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => exportIndividualStatsReport(stats, 'csv')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV
                    </button>
                    {canClearData && authToken && (
                      <button
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ล้างสถิติพนักงานนี้
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white/70 transition-colors cursor-pointer"
                  aria-label="ปิดหน้าต่าง"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Inline Clear Confirmation Banner */}
            {confirmClear && (
              <div className="px-6 py-3 bg-rose-500/15 border-b border-rose-500/35 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-rose-900">
                  ยืนยันการล้างบันทึกเวลาพักของ {employeeCode} ในเดือน {formatThaiMonthLabel(selectedMonth)} ทั้งหมดใช่หรือไม่? (Admin Only)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1 rounded-lg text-xs font-medium liquid-glass-card text-slate-700 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={handleClearEmployeeStats}
                    className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
                  >
                    {clearing ? 'กำลังล้างข้อมูล...' : 'ยืนยันล้างสถิติ'}
                  </button>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loading ? (
                <div className="py-16 text-center text-slate-600">กำลังประมวลผลสถิติรายบุคคล...</div>
              ) : error ? (
                <div className="py-12 text-center text-rose-800 bg-rose-500/15 border border-rose-500/35 rounded-2xl">
                  {error}
                </div>
              ) : stats ? (
                <>
                  {/* Employee Metadata Line */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-300/60 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>แผนก: <strong className="text-slate-900">{stats.employee.department}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>ตำแหน่ง: <strong className="text-slate-900">{stats.employee.position}</strong></span>
                      {stats.employee.nickname && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>ชื่อเล่น: <strong className="text-slate-900">{stats.employee.nickname}</strong></span>
                        </>
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-600">
                      ข้อมูลประจำเดือน {formatThaiMonthLabel(stats.month)}
                    </span>
                  </div>

                  {/* Active Break Banner if currently on break */}
                  {stats.active_break && (
                    <div className="p-4 rounded-2xl bg-sky-500/15 border border-sky-500/35 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-sky-700" />
                        <div>
                          <div className="text-xs font-semibold text-sky-800">กำลังอยู่ในระหว่างเวลาพัก (Real-Time)</div>
                          <div className="text-sm font-bold text-slate-900">
                            {getBreakTypeShortLabel(stats.active_break.break_type)} · เริ่ม {formatBangkokTime(stats.active_break.start_time)}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono-tabular text-2xl font-bold text-slate-900">
                        {formatDurationClock(
                          Math.floor((tickNow + serverTimeOffsetMs - new Date(stats.active_break.start_time).getTime()) / 1000)
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4 KPI Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                    <div className="liquid-glass-card rounded-2xl p-4">
                      <div className="text-xs text-slate-600">จำนวนครั้งที่พัก</div>
                      <div className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                        {stats.summary.total_breaks} <span className="text-xs font-normal text-slate-500">ครั้ง</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        ช่วง1: {stats.summary.break_1_count} · ช่วง2: {stats.summary.break_2_count} · ย่อย: {stats.summary.quick_out_count}
                      </div>
                    </div>

                    <div className="liquid-glass-card rounded-2xl p-4">
                      <div className="text-xs text-slate-600 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        อัตราตรงต่อเวลา
                      </div>
                      <div className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
                        {stats.summary.punctuality_rate}%
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        ปกติ {stats.summary.on_time_count} · อนุโลม {stats.summary.grace_count}
                      </div>
                    </div>

                    <div className="liquid-glass-card rounded-2xl p-4">
                      <div className="text-xs text-slate-600">เวลาพักรวมทั้งเดือน</div>
                      <div className="font-mono-tabular text-2xl font-bold text-sky-700 mt-1">
                        {stats.summary.total_minutes} <span className="text-xs font-normal text-slate-500">นาที</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        เฉลี่ย {stats.summary.avg_minutes} นาที / ครั้ง
                      </div>
                    </div>

                    <div className="liquid-glass-card rounded-2xl p-4">
                      <div className="text-xs text-slate-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        เกินเกณฑ์ 5 นาที
                      </div>
                      <div className="font-mono-tabular text-2xl font-bold text-rose-700 mt-1">
                        {stats.summary.overtime_count} <span className="text-xs font-normal text-slate-500">ครั้ง</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        เกินสะสม {Math.round(stats.summary.total_exceeded_seconds / 60)} นาที
                      </div>
                    </div>
                  </div>

                  {/* Daily Trend Chart */}
                  <div className="liquid-glass-card rounded-2xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <BarChart3 className="w-4 h-4 text-sky-600" />
                        กราฟเวลาพักรายวัน ({formatThaiMonthLabel(stats.month)})
                      </div>
                      <span className="text-xs text-slate-500">หน่วย: นาที / วัน (สีแดง = มีรายการเกิน 5 นาที)</span>
                    </div>

                    {stats.daily_series.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        ยังไม่มีประวัติการพักในเดือนนี้
                      </div>
                    ) : (
                      <div className="flex items-end gap-2 h-36 pt-4 overflow-x-auto pb-1">
                        {stats.daily_series.map((d) => {
                          const heightPct = Math.max(8, Math.round((d.total_minutes / maxDailyMin) * 100));
                          const dayNum = d.work_date.slice(-2);
                          const hasOt = d.overtime_count > 0;
                          return (
                            <div key={d.work_date} className="flex flex-col items-center gap-1.5 min-w-[34px] flex-1">
                              <span className="font-mono-tabular text-[10px] font-semibold text-slate-700">
                                {d.total_minutes}
                              </span>
                              <div className="w-full max-w-[26px] h-24 bg-slate-200/75 rounded-t flex items-end overflow-hidden">
                                <div
                                  className={`w-full rounded-t transition-all ${
                                    hasOt ? 'bg-rose-500' : 'bg-sky-500'
                                  }`}
                                  style={{ height: `${heightPct}%` }}
                                  title={`${formatThaiDateLabel(d.work_date)}: ${d.total_minutes} นาที (${d.breaks_count} ครั้ง)`}
                                />
                              </div>
                              <span className="font-mono-tabular text-[11px] text-slate-600">{dayNum}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Personal Break Log History */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-2.5">
                      ประวัติการบันทึกเวลาพักล่าสุด ({stats.recent_logs.length} รายการ)
                    </h3>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-slate-300/60 bg-white/55">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-white/85 sticky top-0 text-xs text-slate-700 border-b border-slate-300/60">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold">วันที่</th>
                            <th className="py-2.5 px-3 font-semibold">ประเภท</th>
                            <th className="py-2.5 px-3 font-semibold">ออก - เข้า</th>
                            <th className="py-2.5 px-3 font-semibold text-right">ระยะเวลา</th>
                            <th className="py-2.5 px-3 font-semibold">สถานะ</th>
                            <th className="py-2.5 px-3 font-semibold">หมายเหตุ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70">
                          {stats.recent_logs.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                                ไม่พบประวัติการพักในเดือนนี้
                              </td>
                            </tr>
                          ) : (
                            stats.recent_logs.map((log) => {
                              const st = getStatusMeta(log.status);
                              return (
                                <tr key={log.id} className="hover:bg-white/70">
                                  <td className="py-2 px-3 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                                    {log.work_date}
                                  </td>
                                  <td className="py-2 px-3 text-xs text-slate-800 whitespace-nowrap">
                                    {getBreakTypeShortLabel(log.break_type)}
                                  </td>
                                  <td className="py-2 px-3 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                                    {formatBangkokTime(log.start_time)} → {formatBangkokTime(log.end_time)}
                                  </td>
                                  <td className="py-2 px-3 font-mono-tabular text-xs text-right text-slate-900 font-medium whitespace-nowrap">
                                    {log.status === 'active' ? 'กำลังพัก' : formatDurationThai(log.duration_seconds)}
                                  </td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${st.bgClass} ${st.textClass} ${st.borderClass}`}
                                    >
                                      {st.label}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-xs text-slate-600 max-w-[200px] truncate">
                                    {log.note || '—'}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
