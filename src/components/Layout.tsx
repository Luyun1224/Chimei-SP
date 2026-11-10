import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, BellRing, CalendarDays, ClipboardCheck, LayoutGrid, Menu, Settings, Users, X } from 'lucide-react';
import { navigate, type Route } from '../lib/router';
import { useData } from '../lib/store';
import { cx } from './ui';
import { WEB_APP_URL } from '../config';
import { isRemote, signOut } from '../lib/remote';
import { API_VERSION } from '../../shared/version';

export const NAV = [
  { no: '01', path: '/overview', label: '總覽', en: 'Overview', icon: LayoutGrid },
  { no: '02', path: '/schedule', label: '演出排程', en: 'Schedule', icon: CalendarDays },
  { no: '03', path: '/reminder', label: 'LINE 提醒', en: 'Reminder', icon: BellRing },
  { no: '04', path: '/sps', label: 'SP 人員', en: 'SP Directory', icon: Users },
  { no: '05', path: '/verify', label: '演出核定', en: 'Verification', icon: ClipboardCheck },
  { no: '06', path: '/analytics', label: '成果分析', en: 'Analytics', icon: BarChart3 },
  { no: '07', path: '/settings', label: '系統設定', en: 'Settings', icon: Settings },
];

function NavList({ route, onNav }: { route: Route; onNav?: () => void }) {
  return (
    <nav aria-label="主要導覽" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const on = '/' + (route.parts[0] || 'overview') === n.path || (n.path === '/analytics' && route.parts[0] === 'report');
        const Icon = n.icon;
        return (
          <a
            key={n.path}
            href={`#${n.path}`}
            onClick={onNav}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'group relative flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[14px] transition-colors',
              on ? 'text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
            )}
          >
            {on && <motion.span layoutId="nav-active" className="absolute inset-0 -z-0 rounded-[14px] bg-white/10 ring-1 ring-white/15" transition={{ type: 'spring', stiffness: 400, damping: 36 }} />}
            <span className={cx('num relative w-5 text-[11px] font-semibold', on ? 'text-gold' : 'text-white/40')}>{n.no}</span>
            <Icon className="relative size-[18px]" aria-hidden />
            <span className="relative font-medium">{n.label}</span>
            <span className="relative ml-auto text-[10px] uppercase tracking-wider text-white/30">{n.en}</span>
          </a>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <a href="#/overview" className="block px-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Chi Mei · Clinical Skills</div>
      <div className="display mt-1 text-[22px] font-semibold leading-tight text-white">SP Performance Hub</div>
      <div className="mt-0.5 text-[12px] text-white/55">標準化病人演出歷程管理平台</div>
    </a>
  );
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { snap } = useData();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.path]);
  return (
    <div className="min-h-screen lg:pl-[272px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col justify-between bg-pine px-3 py-6 lg:flex">
        <div className="space-y-8">
          <Brand />
          <NavList route={route} />
        </div>
        <div className="space-y-1 px-3 text-[12px] text-white/50">
          {snap && <div className="truncate" title={snap.user.email}>👤 {snap.user.email}</div>}
          {isRemote() && <button className="underline underline-offset-2 hover:text-white" onClick={() => { signOut(); window.location.hash = '#/overview'; window.location.reload(); }}>解除此裝置綁定</button>}
          <div>時區 Asia/Taipei</div>
        </div>
      </aside>

      <header className="app-top sticky top-0 z-30 flex items-center justify-between border-b border-line bg-cream/90 px-4 py-3 backdrop-blur lg:hidden">
        <button aria-label="開啟選單" className="inline-flex size-10 items-center justify-center rounded-full bg-pine text-white" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </button>
        <div className="display text-[17px] font-semibold text-pine">SP Performance Hub</div>
        <span className="size-10" />
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              role="dialog"
              aria-label="主選單"
              className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col gap-8 bg-pine px-3 py-6"
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between">
                <Brand />
                <button aria-label="關閉選單" className="rounded-full p-2 text-white/70 hover:bg-white/10" onClick={() => setOpen(false)}>
                  <X className="size-5" />
                </button>
              </div>
              <NavList route={route} onNav={() => setOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {snap?.mode === 'demo' && (
        <div className="no-print border-b border-gold/40 bg-gold-50 px-4 py-2 text-center text-[13px] text-gold-600 lg:px-10">
          <b>本機示範模式</b>：資料僅存於此瀏覽器、日曆同步為模擬，未連線 Google Sheets / Calendar。正式使用請依部署文件發佈至 Apps Script。
          <button className="ml-2 underline underline-offset-2" onClick={() => navigate('/settings')}>示範工具</button>
          <a className="ml-3 font-semibold underline underline-offset-2" href={WEB_APP_URL} target="_top" rel="noopener">前往正式系統 →</a>
        </div>
      )}
      {snap && snap.mode === 'gas' && (snap.apiVersion || 0) < API_VERSION && (
        <div role="alert" className="no-print border-b border-danger/30 bg-danger-50 px-4 py-2.5 text-center text-[13px] text-danger lg:px-10">
          <b>後端程式（Code.gs）版本較舊</b>，部分功能（例如同一場次多個教案）會無法儲存。請將最新的 Code.gs 貼到 Apps Script，並在「部署 → 管理部署作業 → 編輯 → 版本：新版本 → 部署」後重新整理。
        </div>
      )}
      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
