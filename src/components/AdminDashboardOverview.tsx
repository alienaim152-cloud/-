import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  Timer,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import type {
  CalendarDayAggregate,
  MonthlyEmployeeSummary,
  PublicLivePayload,
} from '../types';
import {
  formatBangkokTime,
  formatDurationClock,
  formatDurationThai,
  formatThaiDateLabel,
  formatThaiMonthLabel,
  getBreakTypeShortLabel,
  getStatusMeta,
} from '../utils/timeUtils';
import { exportBreakLogsReport, exportMonthlySummaryReport } from '../utils/exportUtils';

interface AdminDashboardOverviewProps {
  liveData: PublicLivePayload;
  serverTimeOffsetMs: number;
  month: string;
  onMonthChange: (m: string) => void;
  monthlySummaries: MonthlyEmployeeSummary[];
  calendarDays: CalendarDayAggregate[];
  onOpenEmployeeStats: (code: string) => void;
  onNavigateTab: (tab: 'daily' | 'monthly' | 'calendar' | 'individual' | 'logs') => void;
  canClearData?: boolean;
  onRequestClearAll?: () => void;
}

export function AdminDashboardOverview({
  liveData,
  serverTimeOffsetMs,
  month,
  onMonthChange,
  monthlySummaries,
  calendarDays,
  onOpenEmployeeStats,
  onNavigateTab,
  canClearData = true,
  onRequestClearAll,
}: AdminDashboardOverviewProps) {
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncedNowMs = nowTick + serverTimeOffsetMs;

  const monthlyTotals = useMemo(() => {
    return monthlySummaries.reduce(
      (acc, cur) => {
        acc.total_breaks += cur.total_breaks;
        acc.break_1 += cur.break_1_count;
        acc.break_2 += cur.break_2_count;
        acc.quick_out += cur.quick_out_count;
        acc.on_time += cur.on_time_count;
        acc.grace += cur.grace_count;
        acc.overtime += cur.overtime_count;
        acc.total_minutes += cur.total_minutes;
        return acc;
      },
      {
        total_breaks: 0,
        break_1: 0,
        break_2: 0,
        quick_out: 0,
        on_time: 0,
        grace: 0,
        overtime: 0,
        total_minutes: 0,
      }
    );
  }, [monthlySummaries]);

  const punctualityRate = useMemo(() => {
    const completed = monthlyTotals.on_time + monthlyTotals.grace + monthlyTotals.overtime;
    if (completed === 0) return 100;
    return Math.round(((monthlyTotals.on_time + monthlyTotals.grace) / completed) * 100);
  }, [monthlyTotals]);

  const departmentBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { department: string; employees: number; total_breaks: number; overtime: number; compliant: number; completed: number }
    >();
    for (const emp of monthlySummaries) {
      const cur = map.get(emp.department) || {
        department: emp.department,
        employees: 0,
        total_breaks: 0,
        overtime: 0,
        compliant: 0,
        completed: 0,
      };
      cur.employees += 1;
      cur.total_breaks += emp.total_breaks;
      cur.overtime += emp.overtime_count;
      cur.compliant += emp.on_time_count + emp.grace_count;
      cur.completed += emp.on_time_count + emp.grace_count + emp.overtime_count;
      map.set(emp.department, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total_breaks - a.total_breaks);
  }, [monthlySummaries]);

  const recentOvertimeLogs = useMemo(() => {
    return liveData.today_logs.filter((l) => l.status === 'overtime' || l.violation_recorded === 1).slice(0, 5);
  }, [liveData.today_logs]);

  const recentTrendDays = useMemo(() => {
    return calendarDays.slice(-14);
  }, [calendarDays]);

  const maxDayCount = Math.max(10, ...recentTrendDays.map((d) => d.total_breaks));

  // SVG Donut ring math
  const totalBreakTypes = Math.max(1, monthlyTotals.break_1 + monthlyTotals.break_2 + monthlyTotals.quick_out);
  const b1Pct = (monthlyTotals.break_1 / totalBreakTypes) * 100;
  const b2Pct = (monthlyTotals.break_2 / totalBreakTypes) * 100;
  const qPct = (monthlyTotals.quick_out / totalBreakTypes) * 100;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-sky-700">
            ภาพรวมระบบบันทึกเวลาพักแบบเรียลไทม์ · {formatThaiDateLabel(liveData.today_date)}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5 tracking-tight">
            แดชบอร์ดสรุปผลและสถิติภาพรวม
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="px-3.5 py-2 rounded-xl liquid-glass-input text-xs text-slate-900 font-mono-tabular focus:outline-none"
          />
          <button
            type="button"
            onClick={() => exportBreakLogsReport(liveData.today_logs, `Daily_Summary_${liveData.today_date}`, 'xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Excel วันนี้
          </button>
          <button
            type="button"
            onClick={() => exportMonthlySummaryReport(month, monthlySummaries, 'xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Excel เดือน {month}
          </button>
          {canClearData && onRequestClearAll && (
            <button
              type="button"
              onClick={onRequestClearAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ล้างข้อมูลทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="liquid-glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
            <span>กำลังพักอยู่ขณะนี้ (Real-Time)</span>
            <Timer className="w-4 h-4 text-sky-600" />
          </div>
          <div className="font-mono-tabular text-3xl font-bold text-slate-900 mt-2">
            {liveData.today_summary.active_count}{' '}
            <span className="text-sm font-normal text-slate-500">คน</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-300/60 flex items-center justify-between text-xs text-slate-600">
            <span>พนักงานใช้งานทั้งหมด {liveData.employees.length} คน</span>
            <button
              type="button"
              onClick={() => onNavigateTab('daily')}
              className="text-sky-700 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              ดูรายวัน <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.04 }}
          className="liquid-glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
            <span>ยอดพักวันนี้ / ทั้งเดือน</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="font-mono-tabular text-3xl font-bold text-slate-900 mt-2">
            {liveData.today_summary.total_breaks}{' '}
            <span className="text-sm font-normal text-slate-500">/ {monthlyTotals.total_breaks} ครั้ง</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-300/60 flex items-center justify-between text-xs text-slate-600">
            <span>เวลาพักรวมเดือนนี้ {monthlyTotals.total_minutes} นาที</span>
            <button
              type="button"
              onClick={() => onNavigateTab('monthly')}
              className="text-sky-700 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              ดูรายเดือน <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="liquid-glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>อัตราตรงต่อเวลา ({formatThaiMonthLabel(month)})</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono-tabular text-3xl font-bold text-emerald-700 mt-2">
            {punctualityRate}%
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-300/60 flex items-center justify-between text-xs text-slate-600">
            <span>ปกติ {monthlyTotals.on_time} · อนุโลม {monthlyTotals.grace}</span>
            <button
              type="button"
              onClick={() => onNavigateTab('individual')}
              className="text-sky-700 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              รายบุคคล <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.12 }}
          className="liquid-glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
            <span>บันทึกเกิน 5 นาที (วันนี้ / เดือน)</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="font-mono-tabular text-3xl font-bold text-rose-700 mt-2">
            {liveData.today_summary.overtime_count}{' '}
            <span className="text-sm font-normal text-slate-500">/ {monthlyTotals.overtime} รายการ</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-300/60 flex items-center justify-between text-xs text-slate-600">
            <span>บันทึกข้อมูลอัตโนมัติเมื่อเกิน 5 นาที</span>
            <button
              type="button"
              onClick={() => onNavigateTab('logs')}
              className="text-rose-700 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              ตรวจสอบ <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Charts Row: Daily Trend Stacked Bar + Break Type Donut */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Daily Trend Chart */}
        <div className="xl:col-span-8 liquid-glass rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-sky-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">แนวโน้มการพักรายวันย้อนหลัง</h2>
                <p className="text-xs text-slate-600">
                  เปรียบเทียบจำนวนครั้งที่พักปกติ (ฟ้า) เทียบกับรายการเกิน 5 นาที (แดง) ในเดือน {formatThaiMonthLabel(month)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('calendar')}
              className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              เปิดปฏิทินย้อนหลัง →
            </button>
          </div>

          {recentTrendDays.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">ยังไม่มีข้อมูลสถิติในเดือนนี้</div>
          ) : (
            <div className="flex items-end gap-2.5 h-52 pt-4 overflow-x-auto pb-2">
              {recentTrendDays.map((d) => {
                const totalH = Math.max(10, Math.round((d.total_breaks / maxDayCount) * 100));
                const otRatio = d.total_breaks > 0 ? d.overtime_count / d.total_breaks : 0;
                const otH = Math.round(totalH * otRatio);
                const normalH = Math.max(0, totalH - otH);

                return (
                  <div key={d.work_date} className="flex-1 min-w-[36px] flex flex-col items-center gap-1.5">
                    <span className="font-mono-tabular text-[11px] font-semibold text-slate-700">{d.total_breaks}</span>
                    <div
                      className="w-full max-w-[30px] h-36 bg-white/45 border border-white/65 rounded-t-lg flex flex-col justify-end overflow-hidden shadow-inner"
                      title={`${formatThaiDateLabel(d.work_date)}: ทั้งหมด ${d.total_breaks} ครั้ง (เกิน 5 น.: ${d.overtime_count})`}
                    >
                      {otH > 0 && (
                        <div className="w-full bg-rose-500" style={{ height: `${otH}%` }} />
                      )}
                      {normalH > 0 && (
                        <div className="w-full bg-sky-500" style={{ height: `${normalH}%` }} />
                      )}
                    </div>
                    <span className="font-mono-tabular text-[11px] text-slate-600">
                      {d.work_date.slice(8)}/{d.work_date.slice(5, 7)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Break Type Distribution Donut */}
        <div className="xl:col-span-4 liquid-glass rounded-3xl p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2.5 mb-4">
            <Coffee className="w-5 h-5 text-sky-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">สัดส่วนประเภทเวลาพัก</h2>
              <p className="text-xs text-slate-600">ประจำเดือน {formatThaiMonthLabel(month)}</p>
            </div>
          </div>

          <div className="flex items-center justify-center my-2">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="rgba(148,163,184,0.22)"
                  strokeWidth="16"
                />
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="16"
                  strokeDasharray={`${(b1Pct / 100) * circumference} ${circumference}`}
                  strokeDashoffset={0}
                />
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="16"
                  strokeDasharray={`${(b2Pct / 100) * circumference} ${circumference}`}
                  strokeDashoffset={-((b1Pct / 100) * circumference)}
                />
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="16"
                  strokeDasharray={`${(qPct / 100) * circumference} ${circumference}`}
                  strokeDashoffset={-(((b1Pct + b2Pct) / 100) * circumference)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono-tabular text-2xl font-bold text-slate-900">
                  {monthlyTotals.total_breaks}
                </span>
                <span className="text-[11px] text-slate-500">ครั้งรวม</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 mt-3 text-xs">
            <div className="flex items-center justify-between liquid-glass-card rounded-xl px-3 py-2">
              <span className="flex items-center gap-2 text-slate-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-600" />
                พักช่วงแรก (30 นาที)
              </span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {monthlyTotals.break_1} ({Math.round(b1Pct)}%)
              </span>
            </div>
            <div className="flex items-center justify-between liquid-glass-card rounded-xl px-3 py-2">
              <span className="flex items-center gap-2 text-slate-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                พักช่วงที่สอง (60 นาที)
              </span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {monthlyTotals.break_2} ({Math.round(b2Pct)}%)
              </span>
            </div>
            <div className="flex items-center justify-between liquid-glass-card rounded-xl px-3 py-2">
              <span className="flex items-center gap-2 text-slate-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                เข้า-ออกชั่วคราว (≤ 5 นาที)
              </span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {monthlyTotals.quick_out} ({Math.round(qPct)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Department Breakdown + Active Breaks & Overtime Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Department Breakdown */}
        <div className="xl:col-span-6 liquid-glass rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-600" />
              <h2 className="text-base font-bold text-slate-900">สรุปสถิติแยกตามแผนก</h2>
            </div>
            <span className="text-xs text-slate-600">{departmentBreakdown.length} แผนก</span>
          </div>

          <div className="space-y-3">
            {departmentBreakdown.map((dept) => {
              const rate = dept.completed > 0 ? Math.round((dept.compliant / dept.completed) * 100) : 100;
              return (
                <div key={dept.department} className="liquid-glass-card rounded-2xl p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{dept.department}</div>
                      <div className="text-xs text-slate-600">
                        พนักงาน {dept.employees} คน · พักรวม {dept.total_breaks} ครั้ง
                      </div>
                    </div>
                    <div className="text-right font-mono-tabular">
                      <div className="text-sm font-bold text-emerald-700">{rate}% ตรงเวลา</div>
                      <div className="text-[11px] font-semibold text-rose-700">เกิน 5 น.: {dept.overtime}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 h-1.5 rounded-full bg-white/45 border border-white/65 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Active & Overtime Feed */}
        <div className="xl:col-span-6 liquid-glass rounded-3xl p-5 sm:p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                <h2 className="text-base font-bold text-slate-900">กำลังพักอยู่ขณะนี้ ({liveData.active_breaks.length})</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('daily')}
                className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
              >
                ดูรายงานวันนี้ →
              </button>
            </div>

            {liveData.active_breaks.length === 0 ? (
              <div className="liquid-glass-card rounded-2xl p-4 text-xs text-slate-500 text-center">
                ไม่มีพนักงานกำลังพักในขณะนี้
              </div>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {liveData.active_breaks.map((b) => {
                  const elapsed = Math.max(0, Math.floor((syncedNowMs - new Date(b.start_time).getTime()) / 1000));
                  const isOver = elapsed > (b.allowed_minutes + b.grace_minutes) * 60;
                  return (
                    <div
                      key={b.id}
                      className="liquid-glass-card rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenEmployeeStats(b.employee_code)}
                        className="text-left group cursor-pointer"
                      >
                        <div className="text-xs font-mono-tabular font-semibold text-sky-700 group-hover:underline">
                          {b.employee_code} · {b.full_name}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {getBreakTypeShortLabel(b.break_type)} · เริ่ม {formatBangkokTime(b.start_time)}
                        </div>
                      </button>
                      <span
                        className={`font-mono-tabular text-sm font-bold ${
                          isOver ? 'text-rose-700' : 'text-sky-700'
                        }`}
                      >
                        {formatDurationClock(elapsed)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-300/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h2 className="text-base font-bold text-slate-900">รายการเกิน 5 นาทีวันนี้ ({recentOvertimeLogs.length})</h2>
              </div>
            </div>

            {recentOvertimeLogs.length === 0 ? (
              <div className="liquid-glass-card rounded-2xl p-4 text-xs font-medium text-emerald-700 text-center">
                วันนี้ยังไม่มีรายการเกินเกณฑ์ 5 นาที
              </div>
            ) : (
              <div className="space-y-2">
                {recentOvertimeLogs.map((log) => {
                  const st = getStatusMeta(log.status);
                  return (
                    <div
                      key={log.id}
                      className="liquid-glass-card rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenEmployeeStats(log.employee_code)}
                        className="text-left group cursor-pointer"
                      >
                        <div className="text-xs font-mono-tabular font-semibold text-slate-900 group-hover:underline">
                          {log.employee_code} · {log.full_name}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {getBreakTypeShortLabel(log.break_type)} · ใช้เวลา {formatDurationThai(log.duration_seconds)}
                        </div>
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${st.bgClass} ${st.textClass} ${st.borderClass}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
