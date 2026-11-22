import type { BreakStatus, BreakType, EmployeeStatus } from '../types';

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export function getBangkokDateNow(offsetMs = 0): Date {
  return new Date(Date.now() + offsetMs);
}

export function formatBangkokDateISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatBangkokTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatThaiDateLabel(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const thaiYear = y + 543;
  return `${d} ${THAI_MONTHS[m - 1]} ${thaiYear}`;
}

export function formatThaiMonthLabel(monthStr: string): string {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;
  const [y, m] = monthStr.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatDurationThai(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs} วินาที`;
  if (secs === 0) return `${mins} นาที`;
  return `${mins} นาที ${secs} วินาที`;
}

export function getBreakTypeLabel(type: BreakType): string {
  switch (type) {
    case 'break_1':
      return 'พักช่วงแรก (30 นาที)';
    case 'break_2':
      return 'พักช่วงที่สอง (60 นาที)';
    case 'quick_out':
      return 'เข้า-ออกชั่วคราว (≤ 5 นาที)';
  }
}

export function getBreakTypeShortLabel(type: BreakType): string {
  switch (type) {
    case 'break_1':
      return 'พักช่วง 1 · 30น.';
    case 'break_2':
      return 'พักช่วง 2 · 60น.';
    case 'quick_out':
      return 'เข้า-ออก ≤ 5น.';
  }
}

export function getStatusMeta(status: BreakStatus): {
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
} {
  switch (status) {
    case 'active':
      return {
        label: 'กำลังพัก',
        textClass: 'text-sky-800',
        bgClass: 'bg-sky-500/15',
        borderClass: 'border-sky-600/30',
      };
    case 'on_time':
      return {
        label: 'ตรงเวลา',
        textClass: 'text-emerald-800',
        bgClass: 'bg-emerald-500/15',
        borderClass: 'border-emerald-600/30',
      };
    case 'grace':
      return {
        label: 'อนุโลม ≤ 5 นาที',
        textClass: 'text-amber-800',
        bgClass: 'bg-amber-500/15',
        borderClass: 'border-amber-600/30',
      };
    case 'overtime':
      return {
        label: 'เกินเวลา > 5 นาที',
        textClass: 'text-rose-800',
        bgClass: 'bg-rose-500/15',
        borderClass: 'border-rose-600/30',
      };
  }
}

export const EMPLOYEE_STATUS_OPTIONS: Array<{
  value: EmployeeStatus;
  label: string;
  shortLabel: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}> = [
  {
    value: 'active',
    label: 'ปฏิบัติงาน (Active)',
    shortLabel: 'ปฏิบัติงาน',
    textClass: 'text-emerald-800',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-600/30',
  },
  {
    value: 'on_leave',
    label: 'ลางาน (On Leave)',
    shortLabel: 'ลางาน',
    textClass: 'text-sky-800',
    bgClass: 'bg-sky-500/15',
    borderClass: 'border-sky-600/30',
  },
  {
    value: 'training',
    label: 'อบรม/นอกสถานที่ (Training)',
    shortLabel: 'อบรม/นอกสถานที่',
    textClass: 'text-indigo-800',
    bgClass: 'bg-indigo-500/15',
    borderClass: 'border-indigo-600/30',
  },
  {
    value: 'suspended',
    label: 'พักงานชั่วคราว (Suspended)',
    shortLabel: 'พักงานชั่วคราว',
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-600/30',
  },
  {
    value: 'removed',
    label: 'เอาออก/พ้นสภาพ (Removed)',
    shortLabel: 'เอาออก/พ้นสภาพ',
    textClass: 'text-rose-800',
    bgClass: 'bg-rose-500/15',
    borderClass: 'border-rose-600/30',
  },
];

export function getEmployeeStatusMeta(status: EmployeeStatus | string) {
  if (status === 'inactive') {
    return {
      value: 'inactive' as EmployeeStatus,
      label: 'ระงับสิทธิ์ (Inactive)',
      shortLabel: 'ระงับสิทธิ์',
      textClass: 'text-slate-700',
      bgClass: 'bg-slate-500/15',
      borderClass: 'border-slate-500/30',
    };
  }
  return (
    EMPLOYEE_STATUS_OPTIONS.find((opt) => opt.value === status) || EMPLOYEE_STATUS_OPTIONS[0]
  );
}
