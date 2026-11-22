export type BreakType = 'break_1' | 'break_2' | 'quick_out';

export type BreakStatus = 'active' | 'on_time' | 'grace' | 'overtime';

export type AdminRole = 'super_admin' | 'supervisor' | 'hr_viewer';

export type EmployeeStatus = 'active' | 'on_leave' | 'training' | 'suspended' | 'removed' | 'inactive';

export interface EmployeePublic {
  id: number;
  employee_code: string;
  full_name: string;
  nickname: string;
  department: string;
  position: string;
  shift_name: string;
  status: EmployeeStatus;
}

export interface EmployeeFull extends EmployeePublic {
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface BreakLogRecord {
  id: number;
  employee_id: number;
  employee_code: string;
  full_name: string;
  nickname: string;
  department: string;
  position: string;
  break_type: BreakType;
  allowed_minutes: number;
  grace_minutes: number;
  work_date: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  exceeded_seconds: number;
  grace_exceeded: number;
  violation_recorded: number;
  status: BreakStatus;
  note: string;
  recorded_at: string;
}

export interface DailySummaryStats {
  work_date: string;
  total_breaks: number;
  active_count: number;
  on_time_count: number;
  grace_count: number;
  overtime_count: number;
  total_minutes: number;
  unique_employees: number;
}

export interface CalendarDayAggregate {
  work_date: string;
  total_breaks: number;
  on_time_count: number;
  grace_count: number;
  overtime_count: number;
  active_count: number;
}

export interface MonthlyEmployeeSummary {
  employee_id: number;
  employee_code: string;
  full_name: string;
  department: string;
  position: string;
  total_breaks: number;
  break_1_count: number;
  break_2_count: number;
  quick_out_count: number;
  on_time_count: number;
  grace_count: number;
  overtime_count: number;
  total_minutes: number;
  total_exceeded_seconds: number;
  punctuality_rate: number;
}

export interface IndividualStatsResponse {
  employee: EmployeePublic;
  month: string;
  summary: {
    total_breaks: number;
    break_1_count: number;
    break_2_count: number;
    quick_out_count: number;
    on_time_count: number;
    grace_count: number;
    overtime_count: number;
    total_minutes: number;
    avg_minutes: number;
    total_exceeded_seconds: number;
    punctuality_rate: number;
  };
  daily_series: Array<{
    work_date: string;
    total_minutes: number;
    breaks_count: number;
    overtime_count: number;
  }>;
  recent_logs: BreakLogRecord[];
  active_break: BreakLogRecord | null;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  role: AdminRole;
  is_active: number;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface PublicLivePayload {
  server_time: string;
  today_date: string;
  active_breaks: BreakLogRecord[];
  today_logs: BreakLogRecord[];
  today_summary: DailySummaryStats;
  employees: EmployeePublic[];
}
