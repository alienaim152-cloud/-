import { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, Search, Trash2 } from 'lucide-react';
import type { BreakLogRecord, CalendarDayAggregate, DailySummaryStats } from '../types';
import {
  formatBangkokDateISO,
  formatBangkokTime,
  formatDurationThai,
  formatThaiDateLabel,
  formatThaiMonthLabel,
  getBreakTypeShortLabel,
  getStatusMeta,
} from '../utils/timeUtils';
import { exportBreakLogsReport } from '../utils/exportUtils';

interface CalendarHistoryPanelProps {
  month: string;
  onMonthChange: (newMonth: string) => void;
  calendarDays: CalendarDayAggregate[];
  onSelectEmployeeCode?: (code: string) => void;
  canClearData?: boolean;
  onClearDate?: (dateStr: string) => void;
  realtimeSignal?: number;
}

const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export function CalendarHistoryPanel({
  month,
  onMonthChange,
  calendarDays,
  onSelectEmployeeCode,
  canClearData = false,
  onClearDate,
  realtimeSignal = 0,
}: CalendarHistoryPanelProps) {
  const todayISO = formatBangkokDateISO();
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [historyLogs, setHistoryLogs] = useState<BreakLogRecord[]>([]);
  const [historySummary, setHistorySummary] = useState<DailySummaryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!selectedDate.startsWith(month)) {
      if (todayISO.startsWith(month)) {
        setSelectedDate(todayISO);
      } else {
        setSelectedDate(`${month}-01`);
      }
    }
  }, [month, todayISO, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/history?date=${encodeURIComponent(selectedDate)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setHistoryLogs(Array.isArray(data.logs) ? data.logs : []);
          setHistorySummary(data.summary || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, realtimeSignal]);

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDayAggregate>();
    for (const d of calendarDays) {
      map.set(d.work_date, d);
    }
    return map;
  }, [calendarDays]);

  const gridCells = useMemo(() => {
    const [year, mon] = month.split('-').map(Number);
    const firstDay = new Date(year, mon - 1, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, mon, 0).getDate();

    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(mon).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ dateStr: `${year}-${mm}-${dd}`, dayNum: d });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ dateStr: null, dayNum: null });
    }
    return cells;
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    const nextY = dt.getFullYear();
    const nextM = String(dt.getMonth() + 1).padStart(2, '0');
    onMonthChange(`${nextY}-${nextM}`);
  };

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return historyLogs;
    return historyLogs.filter(
      (l) =>
        l.employee_code.toLowerCase().includes(q) ||
        l.full_name.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q)
    );
  }, [historyLogs, searchTerm]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Interactive Monthly Calendar */}
      <div className="xl:col-span-5 liquid-glass rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="w-4 h-4 text-sky-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-900">ปฏิทินบันทึกเวลาย้อนหลัง</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-xl liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer"
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-800 min-w-[132px] text-center whitespace-nowrap">
              {formatThaiMonthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-xl liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAYS_TH.map((day, idx) => (
            <div
              key={day}
              className={`text-center text-xs font-semibold py-1 ${
                idx === 0 || idx === 6 ? 'text-sky-700' : 'text-slate-600'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {gridCells.map((cell, i) => {
            if (!cell.dateStr || !cell.dayNum) {
              return <div key={`empty-${i}`} className="h-16 rounded-xl bg-white/25" />;
            }
            const agg = dayMap.get(cell.dateStr);
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayISO;
            const hasOvertime = (agg?.overtime_count || 0) > 0;

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => setSelectedDate(cell.dateStr!)}
                className={`h-16 rounded-xl p-1.5 flex flex-col justify-between text-left transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-sky-600/20 border-sky-600 text-slate-900 shadow-sm'
                    : isToday
                    ? 'bg-sky-500/10 border-sky-500/50 text-slate-900 hover:bg-sky-500/20'
                    : 'liquid-glass-card text-slate-800 hover:border-sky-400/70'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-mono-tabular text-xs font-bold">{cell.dayNum}</span>
                  {isToday && (
                    <span className="text-[10px] font-bold text-sky-700">วันนี้</span>
                  )}
                </div>
                {agg && agg.total_breaks > 0 ? (
                  <div className="flex items-center justify-between w-full text-[11px] font-mono-tabular">
                    <span className="text-sky-700 font-semibold">{agg.total_breaks} ครั้ง</span>
                    {hasOvertime && (
                      <span className="text-rose-700 font-bold">!{agg.overtime_count}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400">—</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-300/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>คลิกวันที่เพื่อดูบันทึกเวลาพักย้อนหลังแบบละเอียด</span>
          <span className="text-rose-700 font-semibold font-mono-tabular">!N = จำนวนเกิน 5 นาที</span>
        </div>
      </div>

      {/* Right: Selected Historical Date Logs & Summary */}
      <div className="xl:col-span-7 liquid-glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-medium text-sky-700">ข้อมูลย้อนหลังประจำวันที่</p>
            <h3 className="text-lg font-bold text-slate-900">{formatThaiDateLabel(selectedDate)}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportBreakLogsReport(filteredLogs, `Break_History_${selectedDate}`, 'xlsx')}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              ดาวน์โหลด Excel
            </button>
            <button
              type="button"
              onClick={() => exportBreakLogsReport(filteredLogs, `Break_History_${selectedDate}`, 'csv')}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            {canClearData && onClearDate && (
              <button
                type="button"
                onClick={() => onClearDate(selectedDate)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ล้างข้อมูลวันนี้
              </button>
            )}
          </div>
        </div>

        {/* Summary Strip */}
        {historySummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b border-slate-300/60">
            <div className="liquid-glass-card rounded-2xl px-3 py-2.5">
              <div className="text-xs text-slate-600">จำนวนพักรวม</div>
              <div className="font-mono-tabular text-xl font-bold text-slate-900 mt-0.5">
                {historySummary.total_breaks} <span className="text-xs font-normal text-slate-500">ครั้ง</span>
              </div>
            </div>
            <div className="liquid-glass-card rounded-2xl px-3 py-2.5">
              <div className="text-xs text-slate-600">ตรงเวลา / อนุโลม</div>
              <div className="font-mono-tabular text-xl font-bold text-emerald-700 mt-0.5">
                {historySummary.on_time_count + historySummary.grace_count}
              </div>
            </div>
            <div className="liquid-glass-card rounded-2xl px-3 py-2.5">
              <div className="text-xs text-slate-600">เกิน 5 นาที (บันทึก)</div>
              <div className="font-mono-tabular text-xl font-bold text-rose-700 mt-0.5">
                {historySummary.overtime_count}
              </div>
            </div>
            <div className="liquid-glass-card rounded-2xl px-3 py-2.5">
              <div className="text-xs text-slate-600">เวลาพักรวม</div>
              <div className="font-mono-tabular text-xl font-bold text-sky-700 mt-0.5">
                {historySummary.total_minutes} <span className="text-xs font-normal text-slate-500">นาที</span>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหารหัสพนักงาน ชื่อ หรือแผนก ในวันที่เลือก..."
            className="w-full pl-9 pr-3 py-2 rounded-xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-2xl border border-slate-300/60 bg-white/55">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-white/85 sticky top-0 text-xs text-slate-700 border-b border-slate-300/60">
              <tr>
                <th className="py-2.5 px-3 font-semibold">พนักงาน</th>
                <th className="py-2.5 px-3 font-semibold">ประเภท</th>
                <th className="py-2.5 px-3 font-semibold">ออก - เข้า</th>
                <th className="py-2.5 px-3 font-semibold text-right">ระยะเวลา</th>
                <th className="py-2.5 px-3 font-semibold">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500 text-sm">
                    กำลังโหลดข้อมูลย้อนหลัง...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500 text-sm">
                    ไม่มีบันทึกเวลาพักในวันที่ {formatThaiDateLabel(selectedDate)}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const st = getStatusMeta(log.status);
                  return (
                    <tr key={log.id} className="hover:bg-white/70 transition-colors">
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => onSelectEmployeeCode?.(log.employee_code)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="font-mono-tabular text-xs font-semibold text-sky-700 group-hover:underline">
                            {log.employee_code}
                          </div>
                          <div className="text-slate-900 font-semibold">{log.full_name}</div>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-700 whitespace-nowrap">
                        {getBreakTypeShortLabel(log.break_type)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                        {formatBangkokTime(log.start_time)} → {formatBangkokTime(log.end_time)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-xs text-right text-slate-900 font-medium whitespace-nowrap">
                        {log.status === 'active' ? 'กำลังพัก' : formatDurationThai(log.duration_seconds)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${st.bgClass} ${st.textClass} ${st.borderClass}`}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
