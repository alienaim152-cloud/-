import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicLivePayload } from './types';
import { formatBangkokDateISO } from './utils/timeUtils';
import { SunlitOfficeBackdrop } from './components/SunlitOfficeBackdrop';
import { BreakTerminalView } from './components/BreakTerminalView';
import { AdminPortalView } from './components/AdminPortalView';
import { IndividualStatsModal } from './components/IndividualStatsModal';

type AppViewMode = 'terminal' | 'admin';

const INITIAL_LIVE_PAYLOAD: PublicLivePayload = {
  server_time: new Date().toISOString(),
  today_date: formatBangkokDateISO(),
  active_breaks: [],
  today_logs: [],
  today_summary: {
    work_date: formatBangkokDateISO(),
    total_breaks: 0,
    active_count: 0,
    on_time_count: 0,
    grace_count: 0,
    overtime_count: 0,
    total_minutes: 0,
    unique_employees: 0,
  },
  employees: [],
};

function getInitialViewMode(): AppViewMode {
  if (typeof window === 'undefined') return 'terminal';
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'admin' ? 'admin' : 'terminal';
}

export default function App() {
  const [viewMode, setViewMode] = useState<AppViewMode>(getInitialViewMode);
  const [liveData, setLiveData] = useState<PublicLivePayload>(INITIAL_LIVE_PAYLOAD);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [realtimeSignal, setRealtimeSignal] = useState(0);
  const [statsEmployeeCode, setStatsEmployeeCode] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const applyLivePayload = useCallback((payload: PublicLivePayload) => {
    setLiveData(payload);
    if (payload.server_time) {
      const offset = new Date(payload.server_time).getTime() - Date.now();
      if (!Number.isNaN(offset)) {
        setServerTimeOffsetMs(offset);
      }
    }
    setRealtimeSignal((n) => n + 1);
  }, []);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/public/live');
      if (res.ok) {
        const data = (await res.json()) as PublicLivePayload;
        applyLivePayload(data);
      }
    } catch {
      // ignore transient error; WebSocket reconnect handles recovery
    } finally {
      setInitialLoading(false);
    }
  }, [applyLivePayload]);

  // Initial load + Real-Time WebSocket synchronization
  useEffect(() => {
    fetchLive();

    let stopped = false;
    let retryDelay = 1000;

    const connectWs = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        retryDelay = 1000;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.live) {
            applyLivePayload(msg.live as PublicLivePayload);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!stopped) {
          reconnectTimerRef.current = window.setTimeout(() => {
            retryDelay = Math.min(retryDelay * 1.5, 8000);
            connectWs();
          }, retryDelay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      stopped = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [applyLivePayload, fetchLive]);

  const navigateView = useCallback((nextView: AppViewMode) => {
    setViewMode(nextView);
    if (nextView === 'terminal') {
      setStatsEmployeeCode(null);
    }
    const url = new URL(window.location.href);
    if (nextView === 'admin') {
      url.searchParams.set('view', 'admin');
    } else {
      url.searchParams.delete('view');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const backdropMode: 'terminal' | 'admin' = viewMode === 'terminal' ? 'terminal' : 'admin';

  return (
    <div className="relative min-h-screen text-slate-900">
      {/* Persistent Bright Sunlit Office Workspace Backdrop */}
      <SunlitOfficeBackdrop mode={backdropMode} />

      {initialLoading && liveData.employees.length === 0 ? (
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="px-6 py-4 rounded-2xl liquid-glass text-sm font-medium text-slate-800">
            กำลังเชื่อมต่อระบบบันทึกเวลาพักแบบเรียลไทม์...
          </div>
        </div>
      ) : viewMode === 'terminal' ? (
        <BreakTerminalView
          liveData={liveData}
          serverTimeOffsetMs={serverTimeOffsetMs}
          wsConnected={wsConnected}
          onRefreshLive={fetchLive}
          onOpenAdminPortal={() => navigateView('admin')}
        />
      ) : (
        <AdminPortalView
          liveData={liveData}
          serverTimeOffsetMs={serverTimeOffsetMs}
          wsConnected={wsConnected}
          onGoTerminal={() => navigateView('terminal')}
          onOpenEmployeeStats={(code) => setStatsEmployeeCode(code)}
          onRefreshLive={fetchLive}
          realtimeSignal={realtimeSignal}
        />
      )}

      {/* Floating Individual Statistics Window (Backend Section) */}
      {viewMode === 'admin' && (
        <IndividualStatsModal
          employeeCode={statsEmployeeCode}
          month={liveData.today_date.slice(0, 7)}
          serverTimeOffsetMs={serverTimeOffsetMs}
          onClose={() => setStatsEmployeeCode(null)}
          canClearData={true}
          onDataCleared={fetchLive}
        />
      )}
    </div>
  );
}
