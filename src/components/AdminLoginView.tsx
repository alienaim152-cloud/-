import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import type { AdminRole } from '../types';

export interface AuthSession {
  token: string;
  user: {
    id: number;
    username: string;
    display_name: string;
    role: AdminRole;
  };
}

interface AdminLoginViewProps {
  onSuccess: (session: AuthSession) => void;
  onGoTerminal: () => void;
}

export function AdminLoginView({ onSuccess, onGoTerminal }: AdminLoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [btnHovered, setBtnHovered] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      onSuccess({ token: data.token, user: data.user });
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex flex-col justify-between px-4 py-6 sm:px-8">
      {/* Top Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <span className="text-lg font-bold tracking-tight text-slate-900 px-3 py-1 rounded-xl liquid-glass whitespace-nowrap shrink-0">
          BreakSync
        </span>
        <button
          type="button"
          onClick={onGoTerminal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-800 liquid-glass hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          หน้าลงเวลาพักพนักงาน
        </button>
      </header>

      {/* Center Animated Login Card */}
      <main className="flex-1 flex items-center justify-center py-10">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md"
        >
          <div className="relative liquid-glass-strong rounded-3xl p-7 sm:p-8 overflow-hidden">
            {/* Subtle animated top sweep line */}
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.5 }}
              className="absolute top-0 left-0 w-1/2 h-[2px] pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(2,132,199,0.85), transparent)',
              }}
            />

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35 }}
              className="text-center mb-7"
            >
              <motion.div
                whileHover={{ rotate: [0, -6, 6, 0], scale: 1.05 }}
                transition={{ duration: 0.4 }}
                className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-sky-600/15 border border-sky-600/25 flex items-center justify-center text-sky-700 shadow-sm"
              >
                <ShieldCheck className="w-7 h-7" />
              </motion.div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                เข้าสู่ระบบหลังบ้าน Admin
              </h1>
              <p className="text-sm text-slate-600 mt-1.5">
                จัดการรายชื่อพนักงาน ดูสรุปผล รายงาน และควบคุมสิทธิ์ผู้ใช้งาน
              </p>
            </motion.div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.16, duration: 0.3 }}
              >
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="admin-username">
                  ชื่อผู้ใช้ (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="กรอกชื่อผู้ใช้ (เช่น Admin)"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.22, duration: 0.3 }}
              >
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="admin-password">
                  รหัสผ่าน (Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านผู้ดูแลระบบ"
                    className="w-full pl-10 pr-11 py-3 rounded-2xl liquid-glass-input text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs font-medium text-rose-900"
                >
                  {error}
                </motion.div>
              )}

              {/* Hover-Reactive Animated Login Button */}
              <motion.button
                type="submit"
                disabled={loading}
                onHoverStart={() => setBtnHovered(true)}
                onHoverEnd={() => setBtnHovered(false)}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="relative w-full mt-2 py-3.5 px-5 rounded-2xl font-semibold text-sm text-white overflow-hidden cursor-pointer disabled:opacity-60 shadow-lg"
                style={{
                  background: btnHovered
                    ? 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)'
                    : 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)',
                }}
              >
                {/* Hover Light Sweep */}
                <motion.span
                  aria-hidden="true"
                  animate={{
                    x: btnHovered ? '140%' : '-120%',
                    opacity: btnHovered ? 0.35 : 0,
                  }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent skew-x-[-20deg] pointer-events-none"
                />

                <span className="relative z-10 flex items-center justify-center gap-2">
                  <span>{loading ? 'กำลังตรวจสอบสิทธิ์...' : 'เข้าสู่ระบบหลังบ้าน'}</span>
                  <motion.span
                    animate={{ x: btnHovered ? 5 : 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.span>
                </span>
              </motion.button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-300/60 text-center text-xs text-slate-600">
              พื้นที่ควบคุมเฉพาะผู้ดูแลระบบ · แยกหน้าต่างการใช้งานจากจุดลงเวลาพนักงาน
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-700 font-medium">
        BreakSync · ระบบบันทึกและบริหารจัดการเวลาพักพนักงานแบบเรียลไทม์
      </footer>
    </div>
  );
}
