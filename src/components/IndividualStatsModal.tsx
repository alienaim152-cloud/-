import { motion, AnimatePresence } from 'motion/react';
import { BarChart2, X } from 'lucide-react';
import type { EmployeePublic } from '../types';
import { IndividualEmployeeDashboard } from './IndividualEmployeeDashboard';

interface IndividualStatsModalProps {
  employeeCode: string | null;
  month: string;
  serverTimeOffsetMs: number;
  employeesList?: EmployeePublic[];
  onSelectEmployee?: (code: string) => void;
  onClose: () => void;
  canClearData?: boolean;
  onDataCleared?: () => void;
  realtimeSignal?: number;
}

export function IndividualStatsModal({
  employeeCode,
  month,
  serverTimeOffsetMs,
  employeesList = [],
  onSelectEmployee,
  onClose,
  canClearData = true,
  onDataCleared,
  realtimeSignal = 0,
}: IndividualStatsModalProps) {
  return (
    <AnimatePresence>
      {employeeCode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 liquid-glass-modal-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl max-h-[92vh] flex flex-col liquid-glass-strong rounded-3xl overflow-hidden"
          >
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-3.5 bg-white/45 backdrop-blur-md border-b border-white/60">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
                <BarChart2 className="w-4 h-4 text-sky-700" />
                <span>Dashboard สถิติการลงเวลาพักรายบุคคล</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{employeeCode}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white/80 transition-colors cursor-pointer"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Personal Dashboard Body */}
            <div className="p-4 sm:p-6 overflow-y-auto">
              <IndividualEmployeeDashboard
                employeeCode={employeeCode}
                month={month}
                serverTimeOffsetMs={serverTimeOffsetMs}
                employeesList={employeesList}
                onSelectEmployee={onSelectEmployee}
                canClearData={canClearData}
                onDataCleared={onDataCleared}
                realtimeSignal={realtimeSignal}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
