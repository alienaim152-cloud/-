import * as XLSX from 'xlsx';
import type {
  AuditLogEntry,
  BreakLogRecord,
  EmployeeFull,
  EmployeeStatus,
  IndividualStatsResponse,
  MonthlyEmployeeSummary,
} from '../types';
import {
  formatBangkokTime,
  formatDurationThai,
  getBreakTypeLabel,
  getEmployeeStatusMeta,
  getStatusMeta,
} from './timeUtils';

export interface ImportedEmployeeRow {
  employee_code: string;
  full_name: string;
  nickname: string;
  department: string;
  position: string;
  status: EmployeeStatus;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function mapEmployeeStatus(raw: string): EmployeeStatus {
  const s = raw.trim().toLowerCase();
  if (!s) return 'active';
  if (s === 'on_leave' || s === 'leave' || s === 'ลางาน') return 'on_leave';
  if (s === 'training' || s === 'อบรม' || s === 'อบรม/นอกสถานที่') return 'training';
  if (s === 'suspended' || s === 'พักงาน' || s === 'พักงานชั่วคราว') return 'suspended';
  if (s === 'removed' || s === 'เอาออก' || s === 'พ้นสภาพ' || s === 'ลาออก') return 'removed';
  if (s === 'inactive' || s === 'ปิดใช้งาน' || s === 'ระงับสิทธิ์') return 'inactive';
  return 'active';
}

export async function parseEmployeeImportFile(file: File): Promise<ImportedEmployeeRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rawRows
    .map((row) => {
      const normalizedMap = new Map<string, string>();
      for (const [key, val] of Object.entries(row)) {
        normalizedMap.set(normalizeHeader(key), String(val ?? '').trim());
      }

      const pick = (...aliases: string[]) => {
        for (const alias of aliases) {
          const v = normalizedMap.get(normalizeHeader(alias));
          if (v) return v;
        }
        return '';
      };

      const employee_code = pick('employee_code', 'code', 'empcode', 'id', 'รหัสพนักงาน', 'รหัส').toUpperCase();
      const full_name = pick('full_name', 'fullname', 'name', 'ชื่อนามสกุล', 'ชื่อ-นามสกุล', 'ชื่อสกุล', 'ชื่อพนักงาน', 'ชื่อ');
      const nickname = pick('nickname', 'nick', 'ชื่อเล่น');
      const department = pick('department', 'dept', 'แผนก', 'ฝ่าย') || 'ทั่วไป';
      const position = pick('position', 'role', 'title', 'ตำแหน่ง') || 'พนักงาน';
      const status = mapEmployeeStatus(pick('status', 'สถานะ'));

      return {
        employee_code,
        full_name,
        nickname,
        department,
        position,
        status,
      };
    })
    .filter((r) => r.employee_code && r.full_name);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportJsonToCsv(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function exportSheetsToXlsx(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>, filename: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length > 0 ? s.rows : [{ ข้อมูล: 'ไม่มีรายการ' }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, filename);
}

export function downloadEmployeeImportTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
  const sampleRows = [
    {
      รหัสพนักงาน: 'EMP011',
      'ชื่อ-นามสกุล': 'สมชาย ใจดี',
      ชื่อเล่น: 'ชาย',
      แผนก: 'ฝ่ายปฏิบัติการ',
      ตำแหน่ง: 'พนักงานปฏิบัติการ',
      สถานะ: 'active',
    },
    {
      รหัสพนักงาน: 'EMP012',
      'ชื่อ-นามสกุล': 'วิภาวี ศรีสุข',
      ชื่อเล่น: 'วี',
      แผนก: 'ฝ่ายบริการลูกค้า',
      ตำแหน่ง: 'เจ้าหน้าที่ประสานงาน',
      สถานะ: 'active',
    },
  ];
  if (format === 'csv') {
    exportJsonToCsv(sampleRows, 'Employee_Import_Template.csv');
  } else {
    exportSheetsToXlsx([{ name: 'รายชื่อพนักงาน', rows: sampleRows }], 'Employee_Import_Template.xlsx');
  }
}

export function exportBreakLogsReport(logs: BreakLogRecord[], titlePrefix: string, format: 'xlsx' | 'csv') {
  const rows = logs.map((l) => ({
    วันที่: l.work_date,
    รหัสพนักงาน: l.employee_code,
    'ชื่อ-นามสกุล': l.full_name,
    แผนก: l.department,
    ตำแหน่ง: l.position,
    ประเภทเวลาพัก: getBreakTypeLabel(l.break_type),
    เวลาเริ่มพัก: formatBangkokTime(l.start_time),
    เวลากลับเข้างาน: formatBangkokTime(l.end_time),
    ระยะเวลาที่ใช้: l.status === 'active' ? 'กำลังพัก' : formatDurationThai(l.duration_seconds),
    'เกินเวลา (วินาที)': l.exceeded_seconds,
    'บันทึกเกิน 5 นาที': l.violation_recorded ? 'เกิน 5 นาที (บันทึกแล้ว)' : 'ปกติ',
    สถานะ: getStatusMeta(l.status).label,
    หมายเหตุ: l.note || '',
  }));

  const safeName = `${titlePrefix}_${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    exportJsonToCsv(rows, `${safeName}.csv`);
  } else {
    exportSheetsToXlsx([{ name: 'บันทึกเวลาพัก', rows }], `${safeName}.xlsx`);
  }
}

export function exportMonthlySummaryReport(
  month: string,
  summaries: MonthlyEmployeeSummary[],
  format: 'xlsx' | 'csv'
) {
  const rows = summaries.map((s) => ({
    เดือน: month,
    รหัสพนักงาน: s.employee_code,
    'ชื่อ-นามสกุล': s.full_name,
    แผนก: s.department,
    ตำแหน่ง: s.position,
    จำนวนครั้งพักทั้งหมด: s.total_breaks,
    'พักช่วง 1 (30น.)': s.break_1_count,
    'พักช่วง 2 (60น.)': s.break_2_count,
    'เข้า-ออกชั่วคราว (≤5น.)': s.quick_out_count,
    ตรงเวลา: s.on_time_count,
    'อนุโลม (≤5น.)': s.grace_count,
    'เกินเวลา (>5น.)': s.overtime_count,
    'เวลารวม (นาที)': s.total_minutes,
    'อัตราตรงต่อเวลา (%)': `${s.punctuality_rate}%`,
  }));

  if (format === 'csv') {
    exportJsonToCsv(rows, `Monthly_Break_Summary_${month}.csv`);
  } else {
    exportSheetsToXlsx([{ name: `สรุปเดือน ${month}`, rows }], `Monthly_Break_Summary_${month}.xlsx`);
  }
}

export function exportIndividualStatsReport(stats: IndividualStatsResponse, format: 'xlsx' | 'csv') {
  const summaryRows = [
    {
      รหัสพนักงาน: stats.employee.employee_code,
      'ชื่อ-นามสกุล': stats.employee.full_name,
      แผนก: stats.employee.department,
      ตำแหน่ง: stats.employee.position,
      เดือน: stats.month,
      จำนวนครั้งทั้งหมด: stats.summary.total_breaks,
      'พักช่วง 1 (30น.)': stats.summary.break_1_count,
      'พักช่วง 2 (60น.)': stats.summary.break_2_count,
      'เข้า-ออกชั่วคราว': stats.summary.quick_out_count,
      ตรงเวลา: stats.summary.on_time_count,
      'อนุโลม ≤ 5 นาที': stats.summary.grace_count,
      'เกิน 5 นาที': stats.summary.overtime_count,
      'เวลารวม (นาที)': stats.summary.total_minutes,
      'เฉลี่ยต่อครั้ง (นาที)': stats.summary.avg_minutes,
      'อัตราตรงต่อเวลา (%)': `${stats.summary.punctuality_rate}%`,
    },
  ];

  const logRows = stats.recent_logs.map((l) => ({
    วันที่: l.work_date,
    ประเภท: getBreakTypeLabel(l.break_type),
    เวลาออก: formatBangkokTime(l.start_time),
    เวลาเข้า: formatBangkokTime(l.end_time),
    ระยะเวลา: l.status === 'active' ? 'กำลังพัก' : formatDurationThai(l.duration_seconds),
    สถานะ: getStatusMeta(l.status).label,
    หมายเหตุ: l.note || '',
  }));

  const filenameBase = `Stats_${stats.employee.employee_code}_${stats.month}`;
  if (format === 'csv') {
    exportJsonToCsv(logRows.length > 0 ? logRows : summaryRows, `${filenameBase}.csv`);
  } else {
    exportSheetsToXlsx(
      [
        { name: 'สรุปสถิติรายบุคคล', rows: summaryRows },
        { name: 'ประวัติการพัก', rows: logRows },
      ],
      `${filenameBase}.xlsx`
    );
  }
}

export function exportEmployeesDirectory(employees: EmployeeFull[], format: 'xlsx' | 'csv') {
  const rows = employees.map((e) => ({
    รหัสพนักงาน: e.employee_code,
    'ชื่อ-นามสกุล': e.full_name,
    ชื่อเล่น: e.nickname,
    แผนก: e.department,
    ตำแหน่ง: e.position,
    สถานะ: getEmployeeStatusMeta(e.status).shortLabel,
  }));

  const base = `Employees_Directory_${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    exportJsonToCsv(rows, `${base}.csv`);
  } else {
    exportSheetsToXlsx([{ name: 'รายชื่อพนักงาน', rows }], `${base}.xlsx`);
  }
}

export function exportAuditLogsReport(logs: AuditLogEntry[], format: 'xlsx' | 'csv') {
  const rows = logs.map((l) => ({
    ลำดับ: l.id,
    เวลา: l.created_at,
    ผู้ดำเนินการ: l.actor_username,
    การกระทำ: l.action,
    เป้าหมาย: `${l.target_type}:${l.target_id}`,
    รายละเอียด: l.details,
  }));

  const base = `Admin_Audit_Logs_${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    exportJsonToCsv(rows, `${base}.csv`);
  } else {
    exportSheetsToXlsx([{ name: 'Audit_Logs', rows }], `${base}.xlsx`);
  }
}
