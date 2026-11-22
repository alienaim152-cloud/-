import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminRole,
  AdminUser,
  AuditLogEntry,
  BreakLogRecord,
  CalendarDayAggregate,
  EmployeeFull,
  EmployeeStatus,
  MonthlyEmployeeSummary,
  PublicLivePayload,
} from '../types';
import type { AuthSession } from './AdminLoginView';
import {
  EMPLOYEE_STATUS_OPTIONS,
  formatBangkokDateISO,
  formatBangkokTime,
  formatDurationClock,
  formatDurationThai,
  formatThaiDateLabel,
  formatThaiMonthLabel,
  getBreakTypeShortLabel,
  getEmployeeStatusMeta,
  getStatusMeta,
} from '../utils/timeUtils';
import {
  downloadEmployeeImportTemplate,
  exportAuditLogsReport,
  exportBreakLogsReport,
  exportEmployeesDirectory,
  exportMonthlySummaryReport,
  parseEmployeeImportFile,
  type ImportedEmployeeRow,
} from '../utils/exportUtils';
import { CalendarHistoryPanel } from './CalendarHistoryPanel';
import { AdminDashboardOverview } from './AdminDashboardOverview';

interface AdminPortalViewProps {
  session: AuthSession;
  liveData: PublicLivePayload;
  serverTimeOffsetMs: number;
  wsConnected: boolean;
  onLogout: () => void;
  onGoTerminal: () => void;
  onOpenEmployeeStats: (code: string) => void;
  onRefreshLive: () => void;
  realtimeSignal: number;
}

type AdminTab =
  | 'dashboard'
  | 'daily'
  | 'monthly'
  | 'calendar'
  | 'individual'
  | 'employees'
  | 'logs'
  | 'users'
  | 'audit';

interface ClearConfirmState {
  scope: 'daily' | 'monthly' | 'employees' | 'all_logs' | 'audit';
  title: string;
  description: string;
  date?: string;
  month?: string;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  supervisor: 'Supervisor',
  hr_viewer: 'HR Viewer',
};

export function AdminPortalView({
  session,
  liveData,
  serverTimeOffsetMs,
  wsConnected,
  onLogout,
  onGoTerminal,
  onOpenEmployeeStats,
  onRefreshLive,
  realtimeSignal,
}: AdminPortalViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Employees state + Multi-select
  const [employees, setEmployees] = useState<EmployeeFull[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<EmployeeStatus[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [bulkStatusValue, setBulkStatusValue] = useState<EmployeeStatus>('removed');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [editingEmployee, setEditingEmployee] = useState<Partial<EmployeeFull> | null>(null);
  const [isNewEmployee, setIsNewEmployee] = useState(false);
  const [confirmDeleteEmpId, setConfirmDeleteEmpId] = useState<number | null>(null);

  // Admin-only Clear Data confirmation modal
  const [clearConfirm, setClearConfirm] = useState<ClearConfirmState | null>(null);
  const [clearingData, setClearingData] = useState(false);

  // Excel/CSV import preview state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<ImportedEmployeeRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  // Daily summary filter state
  const [dailySearch, setDailySearch] = useState('');
  const [dailyStatusFilter, setDailyStatusFilter] = useState<'all' | 'active' | 'on_time' | 'grace' | 'overtime'>('all');

  // All Break logs state
  const [logs, setLogs] = useState<BreakLogRecord[]>([]);
  const [logDateFilter, setLogDateFilter] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('all');
  const [logSearch, setLogSearch] = useState('');

  // Reports & Calendar state
  const [reportMonth, setReportMonth] = useState(formatBangkokDateISO().slice(0, 7));
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlyEmployeeSummary[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDayAggregate[]>([]);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [individualSearch, setIndividualSearch] = useState('');

  // Admin Users & Audit state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [newAdminForm, setNewAdminForm] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'supervisor' as AdminRole,
  });
  const [showNewAdminModal, setShowNewAdminModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const canEdit = session.user.role === 'super_admin' || session.user.role === 'supervisor';
  const isSuperAdmin = session.user.role === 'super_admin';

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncedNowMs = nowTick + serverTimeOffsetMs;

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    }),
    [session.token]
  );

  const showMessage = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const fetchEmployees = useCallback(async () => {
    const res = await fetch('/api/admin/employees', { headers: authHeaders });
    if (res.status === 401) {
      onLogout();
      return;
    }
    const data = await res.json();
    if (res.ok) setEmployees(data.employees || []);
  }, [authHeaders, onLogout]);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (logDateFilter) params.set('date', logDateFilter);
    if (logStatusFilter !== 'all') params.set('status', logStatusFilter);
    if (logSearch.trim()) params.set('employee_code', logSearch.trim());
    const res = await fetch(`/api/admin/logs?${params.toString()}`, { headers: authHeaders });
    if (res.status === 401) {
      onLogout();
      return;
    }
    const data = await res.json();
    if (res.ok) setLogs(data.logs || []);
  }, [authHeaders, logDateFilter, logStatusFilter, logSearch, onLogout]);

  const fetchReports = useCallback(async () => {
    const res = await fetch(`/api/public/monthly?month=${encodeURIComponent(reportMonth)}`);
    const data = await res.json();
    if (res.ok) {
      setMonthlySummaries(data.employee_summaries || []);
      setCalendarDays(data.calendar_days || []);
    }
  }, [reportMonth]);

  const fetchAdminUsers = useCallback(async () => {
    if (!canEdit) return;
    const res = await fetch('/api/admin/users', { headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      setAdminUsers(data.users || []);
    }
  }, [authHeaders, canEdit]);

  const fetchAuditLogs = useCallback(async () => {
    const res = await fetch('/api/admin/audit', { headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      setAuditLogs(data.logs || []);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchEmployees();
    fetchLogs();
    fetchReports();
    fetchAdminUsers();
    fetchAuditLogs();
  }, [fetchEmployees, fetchLogs, fetchReports, fetchAdminUsers, fetchAuditLogs, realtimeSignal]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (selectedDepts.length > 0 && !selectedDepts.includes(e.department)) return false;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(e.status)) return false;
      if (!q) return true;
      return (
        e.employee_code.toLowerCase().includes(q) ||
        e.full_name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q)
      );
    });
  }, [employees, empSearch, selectedDepts, selectedStatuses]);

  const allFilteredSelected = useMemo(() => {
    if (filteredEmployees.length === 0) return false;
    return filteredEmployees.every((e) => selectedEmployeeIds.includes(e.id));
  }, [filteredEmployees, selectedEmployeeIds]);

  const toggleSelectEmployee = (id: number) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredEmployees.map((e) => e.id));
      setSelectedEmployeeIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = new Set([...selectedEmployeeIds, ...filteredEmployees.map((e) => e.id)]);
      setSelectedEmployeeIds(Array.from(merged));
    }
  };

  const toggleDeptFilter = (dept: string) => {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const toggleStatusFilter = (status: EmployeeStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const filteredDailyLogs = useMemo(() => {
    const q = dailySearch.trim().toLowerCase();
    return liveData.today_logs.filter((l) => {
      if (dailyStatusFilter !== 'all' && l.status !== dailyStatusFilter) return false;
      if (!q) return true;
      return (
        l.employee_code.toLowerCase().includes(q) ||
        l.full_name.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q)
      );
    });
  }, [liveData.today_logs, dailySearch, dailyStatusFilter]);

  const filteredMonthlySummaries = useMemo(() => {
    const q = monthlySearch.trim().toLowerCase();
    if (!q) return monthlySummaries;
    return monthlySummaries.filter(
      (s) =>
        s.employee_code.toLowerCase().includes(q) ||
        s.full_name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }, [monthlySummaries, monthlySearch]);

  const filteredIndividualDirectory = useMemo(() => {
    const q = individualSearch.trim().toLowerCase();
    if (!q) return monthlySummaries;
    return monthlySummaries.filter(
      (s) =>
        s.employee_code.toLowerCase().includes(q) ||
        s.full_name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }, [monthlySummaries, individualSearch]);

  const handleSaveEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    const url = isNewEmployee ? '/api/admin/employees' : `/api/admin/employees/${editingEmployee.id}`;
    const method = isNewEmployee ? 'POST' : 'PUT';

    const res = await fetch(url, {
      method,
      headers: authHeaders,
      body: JSON.stringify(editingEmployee),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'บันทึกข้อมูลพนักงานไม่สำเร็จ');
      return;
    }
    showMessage('success', isNewEmployee ? 'เพิ่มพนักงานใหม่เรียบร้อยแล้ว' : 'อัปเดตข้อมูลพนักงานเรียบร้อยแล้ว');
    setEditingEmployee(null);
    fetchEmployees();
    fetchAuditLogs();
  };

  const handleDeleteEmployee = async (id: number) => {
    const res = await fetch(`/api/admin/employees/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'ลบพนักงานไม่สำเร็จ');
      return;
    }
    setConfirmDeleteEmpId(null);
    setSelectedEmployeeIds((prev) => prev.filter((item) => item !== id));
    showMessage('success', 'ลบข้อมูลพนักงานออกจากระบบแล้ว');
    fetchEmployees();
    fetchAuditLogs();
  };

  const handleBulkDeleteEmployees = async () => {
    if (selectedEmployeeIds.length === 0) return;
    const res = await fetch('/api/admin/employees/bulk-delete', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ids: selectedEmployeeIds }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'ลบรายชื่อที่เลือกไม่สำเร็จ');
      return;
    }
    setConfirmBulkDelete(false);
    setSelectedEmployeeIds([]);
    showMessage('success', `เอาออก/ลบรายชื่อพนักงานที่เลือก ${data.deleted} คนเรียบร้อยแล้ว`);
    fetchEmployees();
    fetchReports();
    onRefreshLive();
    fetchAuditLogs();
  };

  const handleBulkUpdateStatus = async () => {
    if (selectedEmployeeIds.length === 0) return;
    const res = await fetch('/api/admin/employees/bulk-status', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ids: selectedEmployeeIds, status: bulkStatusValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'อัปเดตสถานะไม่สำเร็จ');
      return;
    }
    const label = getEmployeeStatusMeta(bulkStatusValue).shortLabel;
    showMessage('success', `อัปเดตสถานะพนักงาน ${data.updated} คน เป็น "${label}" เรียบร้อยแล้ว`);
    setSelectedEmployeeIds([]);
    fetchEmployees();
    fetchReports();
    onRefreshLive();
    fetchAuditLogs();
  };

  const handleExecuteClearData = async () => {
    if (!clearConfirm || !isSuperAdmin) return;
    setClearingData(true);
    try {
      const params = new URLSearchParams({ scope: clearConfirm.scope });
      if (clearConfirm.date) params.set('date', clearConfirm.date);
      if (clearConfirm.month) params.set('month', clearConfirm.month);

      const res = await fetch(`/api/admin/clear?${params.toString()}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage('error', data.error || 'ล้างข้อมูลไม่สำเร็จ');
        return;
      }
      showMessage('success', `ล้างข้อมูลเรียบร้อยแล้ว (${data.cleared ?? 0} รายการ)`);
      setClearConfirm(null);
      setSelectedEmployeeIds([]);
      onRefreshLive();
      fetchEmployees();
      fetchLogs();
      fetchReports();
      fetchAuditLogs();
    } catch {
      showMessage('error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setClearingData(false);
    }
  };

  const handleFilePick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await parseEmployeeImportFile(file);
      if (parsed.length === 0) {
        showMessage('error', 'ไม่พบข้อมูลพนักงานในไฟล์ กรุณาตรวจสอบหัวตาราง (รหัสพนักงาน, ชื่อ-นามสกุล)');
        return;
      }
      setImportPreview(parsed);
    } catch {
      showMessage('error', 'ไม่สามารถอ่านไฟล์ Excel/CSV ได้ กรุณาใช้ไฟล์รูปแบบมาตรฐาน');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/admin/employees/import', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ employees: importPreview }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage('error', data.error || 'นำเข้าข้อมูลไม่สำเร็จ');
        return;
      }
      showMessage(
        'success',
        `นำเข้าสำเร็จ: เพิ่มใหม่ ${data.inserted} คน · อัปเดต ${data.updated} คน`
      );
      setImportPreview(null);
      fetchEmployees();
      fetchAuditLogs();
    } finally {
      setImporting(false);
    }
  };

  const handleForceEndBreak = async (logId: number) => {
    const res = await fetch(`/api/admin/logs/${logId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ force_end: true }),
    });
    if (res.ok) {
      showMessage('success', 'ปิดรอบเวลาพักของพนักงานเรียบร้อยแล้ว');
      fetchLogs();
      fetchAuditLogs();
    }
  };

  const handleDeleteLog = async (logId: number) => {
    const res = await fetch(`/api/admin/logs/${logId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (res.ok) {
      showMessage('success', 'ลบบันทึกเวลาพักเรียบร้อยแล้ว');
      fetchLogs();
      fetchAuditLogs();
    }
  };

  const handleCreateAdminUser = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(newAdminForm),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'สร้างบัญชีผู้ใช้งานไม่สำเร็จ');
      return;
    }
    showMessage('success', `สร้างบัญชี ${newAdminForm.username} เรียบร้อยแล้ว`);
    setShowNewAdminModal(false);
    setNewAdminForm({ username: '', display_name: '', password: '', role: 'supervisor' });
    fetchAdminUsers();
    fetchAuditLogs();
  };

  const handleToggleAdminUser = async (user: AdminUser) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ is_active: user.is_active === 1 ? 0 : 1 }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'ปรับสถานะบัญชีไม่สำเร็จ');
      return;
    }
    showMessage('success', 'อัปเดตสถานะสิทธิ์ผู้ใช้งานเรียบร้อยแล้ว');
    fetchAdminUsers();
    fetchAuditLogs();
  };

  const handleChangeAdminRole = async (user: AdminUser, role: AdminRole) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'เปลี่ยนบทบาทไม่สำเร็จ');
      return;
    }
    showMessage('success', `เปลี่ยนสิทธิ์ของ ${user.username} เรียบร้อยแล้ว`);
    fetchAdminUsers();
    fetchAuditLogs();
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    const res = await fetch(`/api/admin/users/${resetPasswordUser.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ password: resetPasswordVal }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage('error', data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      return;
    }
    showMessage('success', `รีเซ็ตรหัสผ่านของ ${resetPasswordUser.username} เรียบร้อยแล้ว`);
    setResetPasswordUser(null);
    setResetPasswordVal('');
    fetchAuditLogs();
  };

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }>;
  }> = [
    {
      groupLabel: 'รายงานและสถิติ',
      items: [
        { id: 'dashboard', label: 'แดชบอร์ดสรุปต่างๆ', icon: LayoutDashboard },
        { id: 'daily', label: 'สรุปผลรายวัน', icon: Clock },
        { id: 'monthly', label: 'สรุปผลรายเดือน', icon: TrendingUp },
        { id: 'calendar', label: 'ปฏิทินย้อนหลัง', icon: Calendar },
        { id: 'individual', label: 'สถิติรายบุคคล', icon: BarChart2 },
      ],
    },
    {
      groupLabel: 'จัดการระบบหลังบ้าน',
      items: [
        { id: 'employees', label: 'พนักงาน & นำเข้า', icon: Users },
        { id: 'logs', label: 'บันทึกเวลาทั้งหมด', icon: Activity },
        ...(canEdit ? [{ id: 'users' as const, label: 'ควบคุมสิทธิ์ผู้ใช้', icon: UserCheck }] : []),
        { id: 'audit', label: 'บันทึกการทำงานระบบ', icon: Shield },
      ],
    },
  ];

  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="relative z-10 min-h-screen p-3 sm:p-5 flex flex-col lg:flex-row gap-5">
      {/* Mobile Top Bar */}
      <div className="lg:hidden liquid-glass rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-600/15 border border-sky-600/25 flex items-center justify-center text-sky-700">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">BreakSync Admin</div>
            <div className="text-[11px] font-medium text-sky-700">{session.user.username}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="p-2 rounded-xl liquid-glass-card text-slate-900 cursor-pointer"
          aria-label="เปิดเมนู"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* FLOATING LIQUID GLASS SIDEBAR */}
      <aside
        className={`${
          mobileMenuOpen ? 'flex' : 'hidden'
        } lg:flex flex-col justify-between shrink-0 liquid-glass-strong rounded-3xl p-3.5 transition-all duration-300 lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] z-30 ${
          sidebarCollapsed ? 'lg:w-[84px]' : 'lg:w-[272px]'
        }`}
      >
        <div className="space-y-4 overflow-y-auto pr-0.5">
          {/* Sidebar Brand + Collapse Toggle */}
          <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-600/15 border border-sky-600/25 flex items-center justify-center text-sky-700 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">BreakSync Admin</div>
                  <div className="text-[11px] font-medium text-sky-700 truncate">
                    {wsConnected ? 'ซิงก์เรียลไทม์' : 'กำลังเชื่อมต่อ'}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="hidden lg:flex p-2 rounded-xl liquid-glass-card text-slate-700 hover:bg-white/90 transition-colors cursor-pointer mx-auto lg:mx-0"
              title={sidebarCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
              aria-label={sidebarCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Groups */}
          <div className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.groupLabel} className="space-y-1">
                {!sidebarCollapsed && (
                  <div className="px-3 text-[11px] font-semibold text-slate-500">
                    {group.groupLabel}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTab(item.id)}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-colors cursor-pointer ${
                        sidebarCollapsed ? 'justify-center' : ''
                      } ${active ? 'text-sky-900' : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'}`}
                    >
                      {active && (
                        <motion.span
                          layoutId="floating-sidebar-active"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          className="absolute inset-0 rounded-2xl bg-sky-500/20 border border-sky-600/35 shadow-sm"
                        />
                      )}
                      <Icon className={`w-4 h-4 relative z-10 shrink-0 ${active ? 'text-sky-700' : 'text-slate-500'}`} />
                      {!sidebarCollapsed && (
                        <span className="relative z-10 truncate">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Floating User & Window Switcher */}
        <div className="pt-3 mt-3 border-t border-slate-300/60 space-y-2">
          {!sidebarCollapsed && (
            <div className="liquid-glass-card rounded-2xl px-3 py-2.5">
              <div className="text-xs font-bold text-slate-900 truncate">{session.user.display_name}</div>
              <div className="text-[11px] font-semibold text-sky-700 font-mono-tabular">
                {session.user.username} · {ROLE_LABELS[session.user.role]}
              </div>
            </div>
          )}

          <div className={`flex ${sidebarCollapsed ? 'flex-col' : 'items-center'} gap-1.5`}>
            <a
              href="/?view=terminal"
              target="_blank"
              rel="noopener noreferrer"
              title="เปิดหน้าลงเวลาพักในหน้าต่างใหม่"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              {!sidebarCollapsed && <span>หน้าลงเวลา</span>}
            </a>
            <button
              type="button"
              onClick={onGoTerminal}
              title="สลับไปหน้าลงเวลา"
              className="px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-700 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
            >
              {sidebarCollapsed ? 'สลับ' : 'สลับหน้า'}
            </button>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="ออกจากระบบ"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>ออกจากระบบ</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 space-y-6 pb-8">
        {/* Global Feedback Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`p-3.5 rounded-2xl border text-sm font-medium flex items-center justify-between gap-3 shadow-sm ${
                toast.type === 'success'
                  ? 'bg-emerald-500/20 border-emerald-600/40 text-emerald-950 backdrop-blur-md'
                  : 'bg-rose-500/20 border-rose-600/40 text-rose-950 backdrop-blur-md'
              }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
                )}
                <span>{toast.text}</span>
              </div>
              <button type="button" onClick={() => setToast(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TAB: DASHBOARD OVERVIEW */}
        {activeTab === 'dashboard' && (
          <AdminDashboardOverview
            liveData={liveData}
            serverTimeOffsetMs={serverTimeOffsetMs}
            month={reportMonth}
            onMonthChange={setReportMonth}
            monthlySummaries={monthlySummaries}
            calendarDays={calendarDays}
            onOpenEmployeeStats={onOpenEmployeeStats}
            onNavigateTab={(t) => setActiveTab(t)}
            canClearData={isSuperAdmin}
            onRequestClearAll={() =>
              setClearConfirm({
                scope: 'all_logs',
                title: 'ล้างข้อมูลบันทึกเวลาพักทั้งหมด',
                description:
                  'การดำเนินการนี้จะลบบันทึกเวลาพักและสถิติการพักทั้งหมดในระบบอย่างถาวร (เฉพาะ Admin เท่านั้น)',
              })
            }
          />
        )}

        {/* TAB: DAILY SUMMARY */}
        {activeTab === 'daily' && (
          <div className="space-y-6">
            {/* 4 Daily KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="liquid-glass rounded-2xl p-4">
                <div className="text-xs font-semibold text-sky-700">พักทั้งหมดวันนี้</div>
                <div className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                  {liveData.today_summary.total_breaks}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ครั้ง ({liveData.today_summary.unique_employees} คน)
                  </span>
                </div>
              </div>
              <div className="liquid-glass rounded-2xl p-4">
                <div className="text-xs font-semibold text-sky-700">กำลังพักอยู่ขณะนี้</div>
                <div className="font-mono-tabular text-2xl font-bold text-sky-700 mt-1">
                  {liveData.today_summary.active_count}{' '}
                  <span className="text-xs font-normal text-slate-500">คน</span>
                </div>
              </div>
              <div className="liquid-glass rounded-2xl p-4">
                <div className="text-xs font-semibold text-emerald-700">ตรงเวลา / อนุโลม ≤ 5 น.</div>
                <div className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
                  {liveData.today_summary.on_time_count + liveData.today_summary.grace_count}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (อนุโลม {liveData.today_summary.grace_count})
                  </span>
                </div>
              </div>
              <div className="liquid-glass rounded-2xl p-4">
                <div className="text-xs font-semibold text-rose-700">เกิน 5 นาที (บันทึกแล้ว)</div>
                <div className="font-mono-tabular text-2xl font-bold text-rose-700 mt-1">
                  {liveData.today_summary.overtime_count}{' '}
                  <span className="text-xs font-normal text-slate-500">รายการ</span>
                </div>
              </div>
            </div>

            <div className="liquid-glass rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    สรุปผลเวลาพักรายวันแบบเรียลไทม์ · {formatThaiDateLabel(liveData.today_date)}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    คลิกชื่อพนักงานเพื่อดูหน้าต่างสถิติรายบุคคลแบบละเอียด
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportBreakLogsReport(filteredDailyLogs, `Daily_Break_${liveData.today_date}`, 'xlsx')
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ดาวน์โหลด Excel รายวัน
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportBreakLogsReport(filteredDailyLogs, `Daily_Break_${liveData.today_date}`, 'csv')
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        setClearConfirm({
                          scope: 'daily',
                          date: liveData.today_date,
                          title: `ล้างข้อมูลรายวัน (${formatThaiDateLabel(liveData.today_date)})`,
                          description: 'ลบรายการบันทึกเวลาพักทั้งหมดของวันนี้ออกจากระบบ (เฉพาะ Admin เท่านั้น)',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      ล้างข้อมูลวันนี้
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={dailySearch}
                    onChange={(e) => setDailySearch(e.target.value)}
                    placeholder="ค้นหารหัส ชื่อ หรือแผนก..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl liquid-glass-card overflow-x-auto">
                  {[
                    { id: 'all' as const, label: 'ทั้งหมด' },
                    { id: 'active' as const, label: 'กำลังพัก' },
                    { id: 'on_time' as const, label: 'ตรงเวลา' },
                    { id: 'grace' as const, label: 'อนุโลม ≤ 5น.' },
                    { id: 'overtime' as const, label: 'เกิน > 5น.' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDailyStatusFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        dailyStatusFilter === f.id
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-300/60 bg-white/55">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-white/85 text-xs text-slate-700 border-b border-slate-300/60">
                    <tr>
                      <th className="py-3 px-3.5 font-semibold">รหัส / พนักงาน</th>
                      <th className="py-3 px-3.5 font-semibold">แผนก</th>
                      <th className="py-3 px-3.5 font-semibold">ประเภทเวลาพัก</th>
                      <th className="py-3 px-3.5 font-semibold">เริ่มพัก</th>
                      <th className="py-3 px-3.5 font-semibold">กลับเข้างาน</th>
                      <th className="py-3 px-3.5 font-semibold text-right">ระยะเวลา</th>
                      <th className="py-3 px-3.5 font-semibold">สถานะ</th>
                      <th className="py-3 px-3.5 font-semibold">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {filteredDailyLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-500">
                          ไม่พบรายการบันทึกเวลาพักตามเงื่อนไขที่เลือก
                        </td>
                      </tr>
                    ) : (
                      filteredDailyLogs.map((log) => {
                        const st = getStatusMeta(log.status);
                        const liveDur =
                          log.status === 'active'
                            ? Math.max(0, Math.floor((syncedNowMs - new Date(log.start_time).getTime()) / 1000))
                            : log.duration_seconds;
                        return (
                          <tr key={log.id} className="hover:bg-white/70 transition-colors">
                            <td className="py-2.5 px-3.5">
                              <button
                                type="button"
                                onClick={() => onOpenEmployeeStats(log.employee_code)}
                                className="text-left group cursor-pointer"
                              >
                                <div className="font-mono-tabular text-xs font-semibold text-sky-700 group-hover:underline">
                                  {log.employee_code}
                                </div>
                                <div className="text-slate-900 font-semibold">{log.full_name}</div>
                              </button>
                            </td>
                            <td className="py-2.5 px-3.5 text-xs text-slate-700">{log.department}</td>
                            <td className="py-2.5 px-3.5 text-xs text-slate-800 whitespace-nowrap">
                              {getBreakTypeShortLabel(log.break_type)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                              {formatBangkokTime(log.start_time)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                              {formatBangkokTime(log.end_time)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono-tabular text-xs text-right text-slate-900 font-medium whitespace-nowrap">
                              {log.status === 'active' ? formatDurationClock(liveDur) : formatDurationThai(liveDur)}
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
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: MONTHLY SUMMARY */}
        {activeTab === 'monthly' && (
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  สรุปผลเวลาพักรายเดือน — {formatThaiMonthLabel(reportMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  คลิกรายชื่อพนักงานเพื่อเปิดหน้าต่างสถิติรายบุคคล
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="px-3 py-2 rounded-xl liquid-glass-input text-xs text-slate-900 font-mono-tabular focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => exportMonthlySummaryReport(reportMonth, filteredMonthlySummaries, 'xlsx')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel รายเดือน
                </button>
                <button
                  type="button"
                  onClick={() => exportMonthlySummaryReport(reportMonth, filteredMonthlySummaries, 'csv')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setClearConfirm({
                        scope: 'monthly',
                        month: reportMonth,
                        title: `ล้างข้อมูลเดือน ${formatThaiMonthLabel(reportMonth)}`,
                        description: 'ลบบันทึกเวลาพักทั้งหมดในเดือนที่เลือกออกจากระบบ (เฉพาะ Admin เท่านั้น)',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างข้อมูลเดือนนี้
                  </button>
                )}
              </div>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={monthlySearch}
                onChange={(e) => setMonthlySearch(e.target.value)}
                placeholder="ค้นหารหัสพนักงาน ชื่อ หรือแผนก..."
                className="w-full pl-9 pr-3 py-2 rounded-xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-300/60 bg-white/55">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-white/85 text-xs text-slate-700 border-b border-slate-300/60">
                  <tr>
                    <th className="py-3 px-3.5 font-semibold">พนักงาน</th>
                    <th className="py-3 px-3.5 font-semibold">แผนก</th>
                    <th className="py-3 px-3.5 font-semibold text-right">พักรวม</th>
                    <th className="py-3 px-3.5 font-semibold text-right">ช่วง 1 (30น.)</th>
                    <th className="py-3 px-3.5 font-semibold text-right">ช่วง 2 (60น.)</th>
                    <th className="py-3 px-3.5 font-semibold text-right">ชั่วคราว (≤5น.)</th>
                    <th className="py-3 px-3.5 font-semibold text-right">เกิน 5 นาที</th>
                    <th className="py-3 px-3.5 font-semibold text-right">เวลารวม</th>
                    <th className="py-3 px-3.5 font-semibold text-right">ตรงต่อเวลา</th>
                    <th className="py-3 px-3.5 font-semibold text-right">สถิติ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {filteredMonthlySummaries.map((s) => (
                    <tr key={s.employee_id} className="hover:bg-white/70 transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="font-mono-tabular text-xs font-semibold text-sky-700">
                          {s.employee_code}
                        </div>
                        <div className="text-slate-900 font-semibold">{s.full_name}</div>
                      </td>
                      <td className="py-2.5 px-3.5 text-xs text-slate-700">{s.department}</td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-slate-900 font-bold">
                        {s.total_breaks}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-slate-700">{s.break_1_count}</td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-slate-700">{s.break_2_count}</td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-slate-700">{s.quick_out_count}</td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-rose-700 font-bold">
                        {s.overtime_count}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-sky-700 font-semibold whitespace-nowrap">
                        {s.total_minutes} นาที
                      </td>
                      <td className="py-2.5 px-3.5 font-mono-tabular text-right text-emerald-700 font-bold">
                        {s.punctuality_rate}%
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenEmployeeStats(s.employee_code)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-sky-500/15 text-sky-800 border border-sky-600/30 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          ดูสถิติ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: HISTORICAL CALENDAR */}
        {activeTab === 'calendar' && (
          <CalendarHistoryPanel
            month={reportMonth}
            onMonthChange={setReportMonth}
            calendarDays={calendarDays}
            onSelectEmployeeCode={onOpenEmployeeStats}
            canClearData={isSuperAdmin}
            realtimeSignal={realtimeSignal}
            onClearDate={(dateStr) =>
              setClearConfirm({
                scope: 'daily',
                date: dateStr,
                title: `ล้างข้อมูลวันที่ ${formatThaiDateLabel(dateStr)}`,
                description: 'ลบบันทึกเวลาพักทั้งหมดของวันที่เลือกออกจากระบบ (เฉพาะ Admin เท่านั้น)',
              })
            }
          />
        )}

        {/* TAB: INDIVIDUAL STATS DIRECTORY */}
        {activeTab === 'individual' && (
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">สถิติรายบุคคล (Individual Statistics)</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  เลือกพนักงานเพื่อเปิดหน้าต่างวิเคราะห์สถิติรายบุคคล กราฟรายวัน และดาวน์โหลดรายงานเฉพาะบุคคล
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="px-3 py-2 rounded-xl liquid-glass-input text-xs text-slate-900 font-mono-tabular focus:outline-none"
                />
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setClearConfirm({
                        scope: 'monthly',
                        month: reportMonth,
                        title: `ล้างข้อมูลสถิติเดือน ${formatThaiMonthLabel(reportMonth)}`,
                        description:
                          'ล้างประวัติการพักและสถิติรายบุคคลทั้งหมดของเดือนที่เลือก (หรือเลือกกดล้างเฉพาะรายคนในหน้าต่างสถิติ)',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างสถิติเดือนนี้
                  </button>
                )}
              </div>
            </div>

            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={individualSearch}
                onChange={(e) => setIndividualSearch(e.target.value)}
                placeholder="ค้นหารหัสพนักงาน ชื่อ-นามสกุล หรือแผนก..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredIndividualDirectory.map((emp) => (
                <button
                  key={emp.employee_id}
                  type="button"
                  onClick={() => onOpenEmployeeStats(emp.employee_code)}
                  className="liquid-glass-card rounded-2xl p-4 text-left hover:border-sky-500/70 hover:bg-white/85 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-sky-600/15 border border-sky-600/25 flex items-center justify-center text-sky-700 shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono-tabular text-xs font-bold text-sky-700">
                          {emp.employee_code}
                        </div>
                        <div className="text-sm font-bold text-slate-900 truncate group-hover:underline">
                          {emp.full_name}
                        </div>
                        <div className="text-xs text-slate-600 truncate">
                          {emp.department} · {emp.position}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono-tabular text-sm font-bold text-emerald-700 shrink-0">
                      {emp.punctuality_rate}%
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-300/60 grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                    <div>
                      <div className="text-[11px] text-slate-500">พักรวม</div>
                      <div className="text-slate-900 font-bold">{emp.total_breaks} ครั้ง</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">เวลารวม</div>
                      <div className="text-sky-700 font-bold">{emp.total_minutes} น.</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">เกิน 5 นาที</div>
                      <div className={emp.overtime_count > 0 ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                        {emp.overtime_count} ครั้ง
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB: EMPLOYEES & EXCEL/CSV IMPORT (NO CONTACT INFO / NO SHIFT, MULTI-SELECT STATUS & REMOVAL) */}
        {activeTab === 'employees' && (
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-300/60">
              <div>
                <h1 className="text-xl font-bold text-slate-900">จัดการข้อมูลพนักงานและนำเข้าไฟล์ Excel / CSV</h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  เพิ่ม แก้ไข เลือกหลายสถานะ เอาออกหลายรายการ หรือนำเข้ารายชื่อผ่าน .xlsx, .xls, .csv
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewEmployee(true);
                        setEditingEmployee({
                          employee_code: '',
                          full_name: '',
                          nickname: '',
                          department: 'ฝ่ายปฏิบัติการ',
                          position: 'พนักงาน',
                          status: 'active',
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      เพิ่มพนักงานใหม่
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => handleFilePick(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Upload className="w-4 h-4" />
                      นำเข้า Excel / CSV
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => downloadEmployeeImportTemplate('xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  ไฟล์ตัวอย่างนำเข้า
                </button>

                <button
                  type="button"
                  onClick={() => exportEmployeesDirectory(filteredEmployees, 'xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-sky-500/15 text-sky-800 border border-sky-600/30 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  ส่งออก Excel
                </button>

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setClearConfirm({
                        scope: 'employees',
                        title: 'ล้างรายชื่อพนักงานทั้งหมด',
                        description:
                          'ลบรายชื่อพนักงานและประวัติการพักทั้งหมดออกจากระบบอย่างถาวร (เฉพาะ Admin เท่านั้น)',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างรายชื่อทั้งหมด
                  </button>
                )}
              </div>
            </div>

            {importPreview && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-600/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900">
                      ตรวจสอบตัวอย่างข้อมูลก่อนนำเข้า ({importPreview.length} รายการ)
                    </h3>
                    <p className="text-xs text-emerald-800">
                      หากรหัสพนักงานซ้ำกับในระบบ ระบบจะอัปเดตข้อมูลส่วนตัวให้อัตโนมัติ
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportPreview(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium liquid-glass-card text-slate-800 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleConfirmImport}
                      className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                    >
                      {importing ? 'กำลังนำเข้า...' : `ยืนยันนำเข้า ${importPreview.length} รายการ`}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-52 overflow-y-auto rounded-xl border border-emerald-600/30 bg-white/75">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/95 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 font-semibold">รหัสพนักงาน</th>
                        <th className="py-2 px-3 font-semibold">ชื่อ-นามสกุล</th>
                        <th className="py-2 px-3 font-semibold">แผนก</th>
                        <th className="py-2 px-3 font-semibold">ตำแหน่ง</th>
                        <th className="py-2 px-3 font-semibold">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {importPreview.map((r, i) => (
                        <tr key={`${r.employee_code}-${i}`}>
                          <td className="py-1.5 px-3 font-mono-tabular font-semibold text-sky-700">{r.employee_code}</td>
                          <td className="py-1.5 px-3 text-slate-900 font-medium">{r.full_name}</td>
                          <td className="py-1.5 px-3 text-slate-700">{r.department}</td>
                          <td className="py-1.5 px-3 text-slate-700">{r.position}</td>
                          <td className="py-1.5 px-3 text-slate-700">{getEmployeeStatusMeta(r.status).shortLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Search + Multi-Select Status & Department Filters */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="ค้นหารหัส ชื่อ แผนก หรือตำแหน่ง..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                {(selectedDepts.length > 0 || selectedStatuses.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDepts([]);
                      setSelectedStatuses([]);
                    }}
                    className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                  >
                    ล้างตัวกรองทั้งหมด
                  </button>
                )}
              </div>

              {/* Multi-Select Status Filter Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-600">กรองสถานะ (เลือกได้หลายตัวเลือก):</span>
                {EMPLOYEE_STATUS_OPTIONS.map((opt) => {
                  const active = selectedStatuses.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleStatusFilter(opt.value)}
                      className={`px-2.5 py-1 rounded-xl border font-medium transition-all cursor-pointer ${
                        active
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'liquid-glass-card text-slate-700 hover:border-sky-400'
                      }`}
                    >
                      {opt.shortLabel}
                    </button>
                  );
                })}
              </div>

              {/* Multi-Select Department Filter Chips */}
              {departments.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">แผนก (เลือกได้หลายแผนก):</span>
                  {departments.map((dept) => {
                    const active = selectedDepts.includes(dept);
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => toggleDeptFilter(dept)}
                        className={`px-2.5 py-1 rounded-xl border font-medium transition-all cursor-pointer ${
                          active
                            ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                            : 'liquid-glass-card text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bulk Multi-Select Action Bar */}
            <AnimatePresence>
              {canEdit && selectedEmployeeIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3.5 rounded-2xl bg-sky-500/15 border border-sky-600/35 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-950">
                    <span>เลือกพนักงานแล้ว {selectedEmployeeIds.length} คน</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployeeIds([]);
                        setConfirmBulkDelete(false);
                      }}
                      className="text-sky-700 underline font-semibold cursor-pointer"
                    >
                      ยกเลิกการเลือก
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="เลือกสถานะสำหรับรายการที่เลือก"
                      value={bulkStatusValue}
                      onChange={(e) => setBulkStatusValue(e.target.value as EmployeeStatus)}
                      className="px-3 py-1.5 rounded-xl liquid-glass-input text-xs font-medium text-slate-900 focus:outline-none"
                    >
                      {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          เปลี่ยนสถานะเป็น: {opt.shortLabel}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkUpdateStatus}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer whitespace-nowrap"
                    >
                      อัปเดตสถานะที่เลือก
                    </button>

                    {confirmBulkDelete ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleBulkDeleteEmployees}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer whitespace-nowrap"
                        >
                          ยืนยันลบ {selectedEmployeeIds.length} คน
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmBulkDelete(false)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-medium liquid-glass-card text-slate-700 cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmBulkDelete(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        เอาออก/ลบที่เลือก ({selectedEmployeeIds.length})
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="overflow-x-auto rounded-2xl border border-slate-300/60 bg-white/55">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-white/85 text-xs text-slate-700 border-b border-slate-300/60">
                  <tr>
                    {canEdit && (
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          aria-label="เลือกพนักงานทั้งหมดในหน้านี้"
                          className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-3 px-3.5 font-semibold">รหัสพนักงาน</th>
                    <th className="py-3 px-3.5 font-semibold">ชื่อ-นามสกุล</th>
                    <th className="py-3 px-3.5 font-semibold">แผนก / ตำแหน่ง</th>
                    <th className="py-3 px-3.5 font-semibold">สถานะ (เลือกได้หลายตัวเลือก)</th>
                    <th className="py-3 px-3.5 font-semibold text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 6 : 5} className="py-10 text-center text-slate-500">
                        ไม่พบข้อมูลพนักงานตามตัวกรองที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const empSt = getEmployeeStatusMeta(emp.status);
                      const isChecked = selectedEmployeeIds.includes(emp.id);
                      return (
                        <tr
                          key={emp.id}
                          className={`transition-colors ${
                            isChecked ? 'bg-sky-500/10' : 'hover:bg-white/70'
                          }`}
                        >
                          {canEdit && (
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectEmployee(emp.id)}
                                aria-label={`เลือก ${emp.full_name}`}
                                className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-3.5 font-mono-tabular text-xs font-bold text-sky-700">
                            <button
                              type="button"
                              onClick={() => onOpenEmployeeStats(emp.employee_code)}
                              className="hover:underline cursor-pointer"
                            >
                              {emp.employee_code}
                            </button>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="text-slate-900 font-semibold">
                              {emp.full_name}{' '}
                              {emp.nickname && <span className="text-xs text-slate-500">({emp.nickname})</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="text-xs font-medium text-slate-800">{emp.department}</div>
                            <div className="text-[11px] text-slate-500">{emp.position}</div>
                          </td>
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            {canEdit ? (
                              <select
                                aria-label={`สถานะของ ${emp.full_name}`}
                                value={emp.status}
                                onChange={async (e) => {
                                  const nextStatus = e.target.value as EmployeeStatus;
                                  const res = await fetch(`/api/admin/employees/${emp.id}`, {
                                    method: 'PUT',
                                    headers: authHeaders,
                                    body: JSON.stringify({ ...emp, status: nextStatus }),
                                  });
                                  if (res.ok) {
                                    showMessage(
                                      'success',
                                      `ปรับสถานะ ${emp.employee_code} เป็น "${getEmployeeStatusMeta(nextStatus).shortLabel}"`
                                    );
                                    fetchEmployees();
                                    fetchReports();
                                    onRefreshLive();
                                    fetchAuditLogs();
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none ${empSt.bgClass} ${empSt.textClass} ${empSt.borderClass}`}
                              >
                                {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value} className="bg-white text-slate-900">
                                    {opt.shortLabel}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${empSt.bgClass} ${empSt.textClass} ${empSt.borderClass}`}
                              >
                                {empSt.shortLabel}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsNewEmployee(false);
                                      setEditingEmployee({ ...emp });
                                    }}
                                    className="p-1.5 rounded-lg text-sky-700 hover:bg-sky-500/15 transition-colors cursor-pointer"
                                    title="แก้ไขข้อมูล"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  {confirmDeleteEmpId === emp.id ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEmployee(emp.id)}
                                        className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-600 text-white cursor-pointer"
                                      >
                                        ยืนยันลบ
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteEmpId(null)}
                                        className="px-2 py-1 rounded text-[11px] bg-slate-200 text-slate-700 cursor-pointer"
                                      >
                                        ยกเลิก
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteEmpId(emp.id)}
                                      className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-500/15 transition-colors cursor-pointer"
                                      title="เอาออก/ลบพนักงาน"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              )}
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
        )}

        {/* TAB: ALL BREAK LOGS */}
        {activeTab === 'logs' && (
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">ตรวจสอบบันทึกเวลาพักทั้งหมด</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  แสดงผลแบบเรียลไทม์พร้อมรายการที่เกิน 5 นาที (บันทึกข้อมูลอัตโนมัติ)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportBreakLogsReport(logs, 'Admin_Break_Logs', 'xlsx')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  ส่งออก Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportBreakLogsReport(logs, 'Admin_Break_Logs', 'csv')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setClearConfirm({
                        scope: 'all_logs',
                        title: 'ล้างบันทึกเวลาพักทั้งหมด',
                        description: 'ลบบันทึกเวลาพักทุกวันและทุกพนักงานออกจากระบบอย่างถาวร (เฉพาะ Admin เท่านั้น)',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างบันทึกทั้งหมด
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="ค้นหารหัสหรือชื่อ..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <input
                type="date"
                value={logDateFilter}
                onChange={(e) => setLogDateFilter(e.target.value)}
                className="px-3 py-2 rounded-xl liquid-glass-input text-xs text-slate-900 font-mono-tabular focus:outline-none"
              />
              {logDateFilter && (
                <button
                  type="button"
                  onClick={() => setLogDateFilter('')}
                  className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                >
                  แสดงทุกวัน
                </button>
              )}
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl liquid-glass-input text-xs text-slate-900 focus:outline-none"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="active">กำลังพักอยู่</option>
                <option value="on_time">ตรงเวลา</option>
                <option value="grace">อนุโลม ≤ 5 นาที</option>
                <option value="overtime_only">เฉพาะเกิน 5 นาที (บันทึกแล้ว)</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-300/60 bg-white/55 max-h-[540px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-white/85 sticky top-0 text-xs text-slate-700 border-b border-slate-300/60">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">วันที่</th>
                    <th className="py-2.5 px-3 font-semibold">พนักงาน</th>
                    <th className="py-2.5 px-3 font-semibold">ประเภท</th>
                    <th className="py-2.5 px-3 font-semibold">เริ่ม - สิ้นสุด</th>
                    <th className="py-2.5 px-3 font-semibold text-right">ระยะเวลา</th>
                    <th className="py-2.5 px-3 font-semibold">สถานะ</th>
                    <th className="py-2.5 px-3 font-semibold">หมายเหตุ</th>
                    <th className="py-2.5 px-3 font-semibold text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {logs.map((log) => {
                    const st = getStatusMeta(log.status);
                    return (
                      <tr key={log.id} className="hover:bg-white/70">
                        <td className="py-2.5 px-3 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                          {log.work_date}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => onOpenEmployeeStats(log.employee_code)}
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
                        <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[180px] truncate">
                          {log.note || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {canEdit && log.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleForceEndBreak(log.id)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              >
                                ปิดรอบพัก
                              </button>
                            )}
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteLog(log.id)}
                                className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-500/15 cursor-pointer"
                                title="ลบบันทึก"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: ADMIN USER & RBAC CONTROL */}
        {activeTab === 'users' && canEdit && (
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">ควบคุมสิทธิ์ผู้ใช้งานระบบหลังบ้าน (RBAC)</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  กำหนดบทบาท ระงับสิทธิ์ หรือรีเซ็ตรหัสผ่านผู้ดูแลและหัวหน้างาน
                </p>
              </div>
              {isSuperAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewAdminModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-sm cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    เพิ่มบัญชีผู้ดูแล
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setClearConfirm({
                        scope: 'audit',
                        title: 'ล้างบันทึกกิจกรรมผู้ใช้งานระบบ',
                        description: 'ล้างบันทึก Audit Log ของการเข้าสู่ระบบและแก้ไขสิทธิ์ทั้งหมด (เฉพาะ Admin เท่านั้น)',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างบันทึกสิทธิ์
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-300/60 bg-white/55">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-white/85 text-xs text-slate-700 border-b border-slate-300/60">
                  <tr>
                    <th className="py-3 px-3.5 font-semibold">ชื่อผู้ใช้</th>
                    <th className="py-3 px-3.5 font-semibold">ชื่อที่แสดง</th>
                    <th className="py-3 px-3.5 font-semibold">ระดับสิทธิ์</th>
                    <th className="py-3 px-3.5 font-semibold">สถานะ</th>
                    <th className="py-3 px-3.5 font-semibold text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {adminUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-white/70">
                      <td className="py-3 px-3.5 font-mono-tabular text-sky-700 font-bold">{u.username}</td>
                      <td className="py-3 px-3.5 text-slate-900 font-medium">{u.display_name}</td>
                      <td className="py-3 px-3.5">
                        {isSuperAdmin && u.username.toLowerCase() !== 'admin' ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeAdminRole(u, e.target.value as AdminRole)}
                            className="px-2.5 py-1 rounded-lg liquid-glass-input text-xs text-slate-900"
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="hr_viewer">HR Viewer</option>
                          </select>
                        ) : (
                          <span className="text-xs font-semibold text-slate-700">{ROLE_LABELS[u.role]}</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
                            u.is_active === 1
                              ? 'bg-emerald-500/15 text-emerald-800 border-emerald-600/30'
                              : 'bg-rose-500/15 text-rose-800 border-rose-600/30'
                          }`}
                        >
                          {u.is_active === 1 ? 'ใช้งานได้' : 'ถูกระงับสิทธิ์'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        {isSuperAdmin && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setResetPasswordUser(u);
                                setResetPasswordVal('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold liquid-glass-card text-sky-700 hover:bg-white/90 cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3" />
                              เปลี่ยนรหัสผ่าน
                            </button>
                            {u.username.toLowerCase() !== 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleToggleAdminUser(u)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 cursor-pointer"
                              >
                                {u.is_active === 1 ? 'ระงับสิทธิ์' : 'เปิดใช้งาน'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">บันทึกการทำงานระบบทั้งหมด (Audit Trail)</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  ตรวจสอบประวัติการเข้าสู่ระบบ การลงเวลา การแก้ไขข้อมูลพนักงาน และการนำเข้าไฟล์ย้อนหลัง
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportAuditLogsReport(auditLogs, 'xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportAuditLogsReport(auditLogs, 'csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-800 hover:bg-white/90 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setClearConfirm({
                        scope: 'audit',
                        title: 'ล้างบันทึกการทำงานระบบทั้งหมด',
                        description: 'ลบบันทึก Audit Logs ทั้งหมดออกจากระบบอย่างถาวร (เฉพาะ Admin เท่านั้น)',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-700 border border-rose-500/35 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ล้างบันทึก Audit
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-300/60 bg-white/55 max-h-[540px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-white/85 sticky top-0 text-slate-700 border-b border-slate-300/60">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">เวลา</th>
                    <th className="py-2.5 px-3 font-semibold">ผู้ดำเนินการ</th>
                    <th className="py-2.5 px-3 font-semibold">คำสั่ง</th>
                    <th className="py-2.5 px-3 font-semibold">เป้าหมาย</th>
                    <th className="py-2.5 px-3 font-semibold">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {auditLogs.map((a) => (
                    <tr key={a.id} className="hover:bg-white/70">
                      <td className="py-2 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                        {a.created_at.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2 px-3 font-mono-tabular text-sky-700 font-bold">{a.actor_username}</td>
                      <td className="py-2 px-3 font-mono-tabular text-slate-800">{a.action}</td>
                      <td className="py-2 px-3 font-mono-tabular text-slate-600">
                        {a.target_type} · {a.target_id}
                      </td>
                      <td className="py-2 px-3 text-slate-800">{a.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Inline Admin-only Clear Data Confirmation */}
      {clearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          onClick={() => !clearingData && setClearConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md liquid-glass-strong rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{clearConfirm.title}</h3>
                <p className="text-xs text-slate-600 mt-1">{clearConfirm.description}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-300/60">
              <button
                type="button"
                disabled={clearingData}
                onClick={() => setClearConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-700 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={clearingData}
                onClick={handleExecuteClearData}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
              >
                {clearingData ? 'กำลังล้างข้อมูล...' : 'ยืนยันล้างข้อมูล (Admin)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Employee (NO Contact Info / NO Shift, Multi-Option Status) */}
      {editingEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          onClick={() => setEditingEmployee(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl liquid-glass-strong rounded-3xl p-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-300/60">
              <h3 className="text-lg font-bold text-slate-900">
                {isNewEmployee ? 'เพิ่มรายชื่อพนักงานใหม่' : `แก้ไขข้อมูลพนักงาน (${editingEmployee.employee_code})`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสพนักงาน *</label>
                <input
                  required
                  type="text"
                  value={editingEmployee.employee_code || ''}
                  onChange={(e) =>
                    setEditingEmployee({ ...editingEmployee, employee_code: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อ-นามสกุล *</label>
                <input
                  required
                  type="text"
                  value={editingEmployee.full_name || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อเล่น</label>
                <input
                  type="text"
                  value={editingEmployee.nickname || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, nickname: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">แผนก *</label>
                <input
                  required
                  type="text"
                  value={editingEmployee.department || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">ตำแหน่ง *</label>
                <input
                  required
                  type="text"
                  value={editingEmployee.position || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, position: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  สถานะพนักงาน (เลือกได้หลายตัวเลือก)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EMPLOYEE_STATUS_OPTIONS.map((opt) => {
                    const selected = (editingEmployee.status || 'active') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingEmployee({ ...editingEmployee, status: opt.value })}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer ${
                          selected
                            ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                            : 'liquid-glass-card text-slate-700 hover:border-sky-400'
                        }`}
                      >
                        {opt.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-300/60">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-700 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-sm cursor-pointer"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Admin User */}
      {showNewAdminModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          onClick={() => setShowNewAdminModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md liquid-glass-strong rounded-3xl p-6"
          >
            <h3 className="text-lg font-bold text-slate-900 mb-4">เพิ่มผู้ใช้งานระบบหลังบ้าน</h3>
            <form onSubmit={handleCreateAdminUser} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อผู้ใช้ (Username)</label>
                <input
                  required
                  type="text"
                  value={newAdminForm.username}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อแสดงผล</label>
                <input
                  required
                  type="text"
                  value={newAdminForm.display_name}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</label>
                <input
                  required
                  minLength={6}
                  type="password"
                  value={newAdminForm.password}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">บทบาทสิทธิ์</label>
                <select
                  value={newAdminForm.role}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, role: e.target.value as AdminRole })}
                  className="w-full px-3 py-2 rounded-xl liquid-glass-input text-slate-900"
                >
                  <option value="super_admin">Super Admin (จัดการได้ทั้งหมด)</option>
                  <option value="supervisor">Supervisor (จัดการพนักงาน & บันทึก)</option>
                  <option value="hr_viewer">HR Viewer (ดูและดาวน์โหลดรายงาน)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewAdminModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold liquid-glass-card text-slate-700 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                >
                  สร้างบัญชี
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Admin Password */}
      {resetPasswordUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          onClick={() => setResetPasswordUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm liquid-glass-strong rounded-3xl p-6"
          >
            <h3 className="text-base font-bold text-slate-900 mb-3">
              ตั้งรหัสผ่านใหม่สำหรับ {resetPasswordUser.username}
            </h3>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <input
                required
                minLength={6}
                type="password"
                placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
                value={resetPasswordVal}
                onChange={(e) => setResetPasswordVal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl liquid-glass-input text-sm text-slate-900"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold liquid-glass-card text-slate-700 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                >
                  บันทึกรหัสผ่าน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
