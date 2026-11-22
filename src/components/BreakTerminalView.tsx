import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Coffee,
  ExternalLink,
  LogIn,
  LogOut,
  Search,
  Shield,
  Timer,
} from 'lucide-react';
import type { BreakLogRecord, BreakType, EmployeePublic, PublicLivePayload } from '../types';
import {
  formatBangkokTime,
  formatDurationClock,
  formatDurationThai,
  formatThaiDateLabel,
  getBreakTypeLabel,
  getBreakTypeShortLabel,
  getStatusMeta,
} from '../utils/timeUtils';

interface BreakTerminalViewProps {
  liveData: PublicLivePayload;
  serverTimeOffsetMs: number;
  wsConnected: boolean;
  onRefreshLive: () => void;
  onOpenAdminPortal: () => void;
}

export function BreakTerminalView({
  liveData,
  serverTimeOffsetMs,
  wsConnected,
  onRefreshLive,
  onOpenAdminPortal,
}: BreakTerminalViewProps) {
  const [employeeCodeInput, setEmployeeCodeInput] = useState('');
  const [selectedBreakType, setSelectedBreakType] = useState<BreakType>('break_1');
  const [noteInput, setNoteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [actionHovered, setActionHovered] = useState(false);

  // 1-second precision clock synced with server time
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncedNowMs = nowTick + serverTimeOffsetMs;
  const liveClockStr = useMemo(() => {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(syncedNowMs));
  }, [syncedNowMs]);

  const normalizedInputCode = employeeCodeInput.trim().toUpperCase();

  const matchedEmployee: EmployeePublic | undefined = useMemo(() => {
    if (!normalizedInputCode) return undefined;
    return liveData.employees.find((e) => e.employee_code.toUpperCase() === normalizedInputCode);
  }, [liveData.employees, normalizedInputCode]);

  const matchedActiveBreak: BreakLogRecord | undefined = useMemo(() => {
    if (!normalizedInputCode) return undefined;
    return liveData.active_breaks.find((b) => b.employee_code.toUpperCase() === normalizedInputCode);
  }, [liveData.active_breaks, normalizedInputCode]);

  const handleClockSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!normalizedInputCode) {
      setFeedback({ type: 'error', text: 'กรุณากรอกรหัสพนักงานก่อนบันทึกเวลา' });
      return;
    }

    setSubmitting(true);
    try {
      if (matchedActiveBreak) {
        const res = await fetch('/api/public/break/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_code: normalizedInputCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFeedback({ type: 'error', text: data.error || 'บันทึกกลับเข้างานไม่สำเร็จ' });
          return;
        }
        const rec: BreakLogRecord = data.record;
        const st = getStatusMeta(rec.status);
        setFeedback({
          type: rec.status === 'overtime' ? 'error' : 'success',
          text: `${rec.employee_code} ${rec.full_name} กลับเข้าปฏิบัติงานแล้ว · ใช้เวลา ${formatDurationThai(rec.duration_seconds)} (${st.label})`,
        });
        setNoteInput('');
        onRefreshLive();
      } else {
        const res = await fetch('/api/public/break/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_code: normalizedInputCode,
            break_type: selectedBreakType,
            note: noteInput.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFeedback({ type: 'error', text: data.error || 'เริ่มบันทึกเวลาพักไม่สำเร็จ' });
          return;
        }
        const rec: BreakLogRecord = data.record;
        setFeedback({
          type: 'success',
          text: `บันทึกเริ่ม${getBreakTypeLabel(rec.break_type)} ให้ ${rec.employee_code} (${rec.full_name}) เรียบร้อยแล้ว`,
        });
        setNoteInput('');
        onRefreshLive();
      }
    } catch {
      setFeedback({ type: 'error', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickReturn = async (code: string) => {
    setFeedback(null);
    try {
      const res = await fetch('/api/public/break/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_code: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'ไม่สามารถปิดรอบพักได้' });
        return;
      }
      const rec: BreakLogRecord = data.record;
      setFeedback({
        type: rec.status === 'overtime' ? 'error' : 'success',
        text: `${rec.employee_code} ${rec.full_name} กลับเข้าปฏิบัติงานแล้ว (${formatDurationThai(rec.duration_seconds)})`,
      });
      onRefreshLive();
    } catch {
      setFeedback({ type: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    }
  };

  const breakOptions: Array<{
    type: BreakType;
    title: string;
    durationLabel: string;
    ruleLabel: string;
  }> = [
    {
      type: 'break_1',
      title: 'พักช่วงแรก',
      durationLabel: '30 นาที',
      ruleLabel: 'เข้า-ออกไม่เกิน +5 นาที',
    },
    {
      type: 'break_2',
      title: 'พักช่วงที่สอง',
      durationLabel: '60 นาที',
      ruleLabel: 'เข้า-ออกไม่เกิน +5 นาที',
    },
    {
      type: 'quick_out',
      title: 'เข้า-ออกชั่วคราว',
      durationLabel: '≤ 5 นาที',
      ruleLabel: 'เกิน 5 นาทีบันทึกข้อมูลทันที',
    },
  ];

  return (
    <div className="relative z-10 min-h-screen flex flex-col justify-between px-4 py-5 sm:px-6">
      {/* Floating Liquid Glass Top Bar */}
      <header className="max-w-[1280px] w-full mx-auto">
        <div className="liquid-glass rounded-2xl px-5 py-3 flex items-center justify-between gap-6">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            BreakSync
          </span>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 font-medium">
            <span>จุดลงเวลาพักเข้า-ออกพนักงาน</span>
            <span aria-hidden="true">·</span>
            <span>{formatThaiDateLabel(liveData.today_date)}</span>
            <span aria-hidden="true">·</span>
            <span className={wsConnected ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
              {wsConnected ? 'เชื่อมต่อเรียลไทม์' : 'กำลังเชื่อมต่อ'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAdminPortal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5" />
              ระบบหลังบ้าน Admin
            </button>
            <a
              href="/?view=admin"
              target="_blank"
              rel="noopener noreferrer"
              title="เปิดระบบหลังบ้านในหน้าต่างใหม่"
              className="p-2 rounded-xl text-slate-700 liquid-glass-card hover:bg-white/90 transition-colors shrink-0"
              aria-label="เปิดระบบหลังบ้านในหน้าต่างใหม่"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Dedicated Break Recording Workspace */}
      <main className="flex-1 flex items-center justify-center py-6">
        <div className="max-w-[1280px] w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Liquid Glass Animated Break Terminal */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 liquid-glass-strong rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden"
          >
            {/* Subtle Liquid Specular Top Sweep */}
            <motion.div
              animate={{ x: ['-100%', '220%'] }}
              transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
              className="absolute top-0 left-0 w-1/3 h-[2px] pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(14,165,233,0.75), transparent)',
              }}
            />

            <div>
              <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-300/60">
                <div>
                  <div className="text-xs font-medium text-sky-700">
                    หน้าบันทึกเวลาพักเข้า-ออก · แยกส่วนจากระบบรายงานหลังบ้าน
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tracking-tight text-balance">
                    ลงชื่อบันทึกเวลาพักด้วยรหัสพนักงาน
                  </h1>
                </div>

                <div className="liquid-glass-card rounded-2xl px-4 py-2.5 text-right shrink-0">
                  <div className="text-[11px] font-medium text-slate-500">เวลาปัจจุบัน (Real-Time)</div>
                  <div className="font-mono-tabular text-2xl font-bold text-slate-900 tracking-wider">
                    {liveClockStr}
                  </div>
                </div>
              </div>

              <form onSubmit={handleClockSubmit} className="mt-6 space-y-5">
                {/* Employee ID Input */}
                <div>
                  <label htmlFor="emp-code-input" className="block text-xs font-semibold text-slate-700 mb-2">
                    รหัสพนักงาน (Employee ID)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-7 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="emp-code-input"
                        type="text"
                        value={employeeCodeInput}
                        onChange={(e) => {
                          setEmployeeCodeInput(e.target.value.toUpperCase());
                          setFeedback(null);
                        }}
                        placeholder="กรอกรหัสพนักงาน เช่น EMP001"
                        className="w-full pl-10 pr-4 py-3.5 rounded-2xl liquid-glass-input text-base font-mono-tabular font-semibold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none transition-all"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <select
                        aria-label="เลือกรหัสพนักงานด่วน"
                        value={matchedEmployee ? matchedEmployee.employee_code : ''}
                        onChange={(e) => {
                          setEmployeeCodeInput(e.target.value);
                          setFeedback(null);
                        }}
                        className="w-full h-full px-3.5 py-3.5 rounded-2xl liquid-glass-input text-sm text-slate-800 focus:outline-none"
                      >
                        <option value="">-- เลือกจากรายชื่อพนักงาน --</option>
                        {liveData.employees.map((emp) => (
                          <option key={emp.id} value={emp.employee_code}>
                            {emp.employee_code} · {emp.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Verified Employee Preview Card */}
                  <AnimatePresence mode="wait">
                    {matchedEmployee && (
                      <motion.div
                        key={matchedEmployee.employee_code}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="mt-3 p-4 rounded-2xl liquid-glass-card flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {matchedEmployee.full_name}{' '}
                            {matchedEmployee.nickname && (
                              <span className="text-sky-700 font-normal">({matchedEmployee.nickname})</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {matchedEmployee.department} · {matchedEmployee.position}
                          </div>
                        </div>

                        {matchedActiveBreak ? (
                          <div className="text-right">
                            <div className="text-xs text-amber-700 font-semibold">กำลังพักอยู่ขณะนี้</div>
                            <div className="font-mono-tabular text-lg font-bold text-slate-900">
                              {formatDurationClock(
                                Math.floor((syncedNowMs - new Date(matchedActiveBreak.start_time).getTime()) / 1000)
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700">พร้อมลงเวลาพัก</span>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Break Type Selection */}
                {!matchedActiveBreak && (
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      เลือกช่วงเวลาพัก (เกณฑ์เข้า-ออกไม่เกิน 5 นาที)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {breakOptions.map((opt) => {
                        const selected = selectedBreakType === opt.type;
                        return (
                          <motion.button
                            key={opt.type}
                            type="button"
                            onClick={() => setSelectedBreakType(opt.type)}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.985 }}
                            transition={{ duration: 0.15 }}
                            className={`p-4 rounded-2xl text-left border transition-all cursor-pointer ${
                              selected
                                ? 'bg-sky-600/15 border-sky-600/70 text-slate-900 shadow-sm'
                                : 'liquid-glass-card text-slate-700 hover:border-sky-400/70 hover:bg-white/80'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-semibold ${selected ? 'text-sky-800' : 'text-slate-700'}`}>
                                {opt.title}
                              </span>
                              <Coffee className={`w-4 h-4 ${selected ? 'text-sky-600' : 'text-slate-400'}`} />
                            </div>
                            <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-1.5">
                              {opt.durationLabel}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1">{opt.ruleLabel}</div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Note Input */}
                <div>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="หมายเหตุเพิ่มเติม (ถ้ามี) เช่น ติดต่อคลังสินค้า..."
                    className="w-full px-4 py-3 rounded-2xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
                  />
                </div>

                {/* Feedback Toast */}
                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className={`p-3.5 rounded-2xl border text-sm flex items-start gap-2.5 ${
                        feedback.type === 'success'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-900'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-900'
                      }`}
                    >
                      {feedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
                      )}
                      <span>{feedback.text}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Hover-Reactive CTA */}
                <motion.button
                  type="submit"
                  disabled={submitting}
                  onHoverStart={() => setActionHovered(true)}
                  onHoverEnd={() => setActionHovered(false)}
                  whileHover={{ scale: 1.015, y: -1 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  className="relative w-full py-4 px-6 rounded-2xl font-semibold text-sm text-white overflow-hidden cursor-pointer shadow-lg disabled:opacity-50"
                  style={{
                    background: matchedActiveBreak
                      ? actionHovered
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                      : actionHovered
                      ? 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)'
                      : 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)',
                  }}
                >
                  <motion.span
                    aria-hidden="true"
                    animate={{
                      x: actionHovered ? '140%' : '-120%',
                      opacity: actionHovered ? 0.35 : 0,
                    }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent skew-x-[-20deg] pointer-events-none"
                  />
                  <span className="relative z-10 flex items-center justify-center gap-2.5">
                    {matchedActiveBreak ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                    <span>
                      {submitting
                        ? 'กำลังบันทึกข้อมูลเรียลไทม์...'
                        : matchedActiveBreak
                        ? 'บันทึกกลับเข้าปฏิบัติงาน (Clock In)'
                        : `ยืนยันเริ่ม${getBreakTypeLabel(selectedBreakType)}`}
                    </span>
                    <motion.span
                      animate={{ x: actionHovered ? 5 : 0 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </motion.span>
                  </span>
                </motion.button>
              </form>
            </div>
          </motion.div>

          {/* Right: Live Active Breaks Monitor */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.46, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 liquid-glass rounded-3xl p-6 sm:p-7 flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-300/60">
              <div className="flex items-center gap-2.5">
                <Timer className="w-5 h-5 text-sky-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">กำลังพักอยู่ขณะนี้ (Real-Time)</h2>
                  <p className="text-xs text-slate-600">
                    จับเวลาต่อเนื่องทันทีแม้เปิดหน้าเว็บใหม่
                  </p>
                </div>
              </div>
              <span className="font-mono-tabular text-sm font-bold px-3 py-1 rounded-xl liquid-glass-card text-sky-800">
                {liveData.active_breaks.length} คน
              </span>
            </div>

            <div className="flex-1 mt-4 space-y-3 overflow-y-auto max-h-[460px] pr-1">
              {liveData.active_breaks.length === 0 ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 rounded-2xl liquid-glass-card">
                  <Clock className="w-9 h-9 text-sky-600/60 mb-2.5" />
                  <div className="text-sm font-semibold text-slate-800">ไม่มีพนักงานอยู่ระหว่างพักในขณะนี้</div>
                  <p className="text-xs text-slate-600 mt-1 max-w-xs">
                    กรอกรหัสพนักงานด้านซ้ายเพื่อเริ่มพักช่วง 1 (30น.), ช่วง 2 (60น.) หรือเข้า-ออกชั่วคราว (≤ 5น.)
                  </p>
                </div>
              ) : (
                liveData.active_breaks.map((item) => {
                  const elapsedSec = Math.max(
                    0,
                    Math.floor((syncedNowMs - new Date(item.start_time).getTime()) / 1000)
                  );
                  const allowedSec = item.allowed_minutes * 60;
                  const maxGraceSec = (item.allowed_minutes + item.grace_minutes) * 60;
                  const remainingSec = allowedSec - elapsedSec;

                  const isOverLimit = elapsedSec > maxGraceSec;
                  const isInGrace = !isOverLimit && elapsedSec > allowedSec;

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-4 rounded-2xl border transition-colors ${
                        isOverLimit
                          ? 'bg-rose-500/15 border-rose-500/45'
                          : isInGrace
                          ? 'bg-amber-500/15 border-amber-500/45'
                          : 'liquid-glass-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono-tabular font-bold text-sky-700">
                              {item.employee_code}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="text-slate-600">{item.department}</span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">{item.full_name}</div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {getBreakTypeShortLabel(item.break_type)} · เริ่ม {formatBangkokTime(item.start_time)}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`font-mono-tabular text-xl font-bold ${
                              isOverLimit ? 'text-rose-700' : isInGrace ? 'text-amber-700' : 'text-slate-900'
                            }`}
                          >
                            {formatDurationClock(elapsedSec)}
                          </div>
                          <div className="font-mono-tabular text-[11px] text-slate-600">
                            {remainingSec >= 0
                              ? `เหลือ ${formatDurationClock(remainingSec)}`
                              : `เกิน ${formatDurationClock(Math.abs(remainingSec))}`}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-300/60 flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            isOverLimit
                              ? 'text-rose-700'
                              : isInGrace
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {isOverLimit
                            ? 'เกิน 5 นาทีแล้ว (บันทึกข้อมูลอัตโนมัติ)'
                            : isInGrace
                            ? 'อยู่ในช่วงอนุโลมไม่เกิน 5 นาที'
                            : 'อยู่ในเวลาพักปกติ'}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleQuickReturn(item.employee_code)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                        >
                          กลับเข้างาน
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="max-w-[1280px] w-full mx-auto text-center text-xs text-slate-700 font-medium py-1">
        หน้าลงเวลาพักพนักงาน · รายงานสรุปรายวัน รายเดือน ปฏิทินย้อนหลัง และสถิติรายบุคคลอยู่ในระบบหลังบ้าน Admin
      </footer>
    </div>
  );
}
