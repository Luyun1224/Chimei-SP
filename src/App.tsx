import { Component, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Lock, RefreshCw } from 'lucide-react';
import { DataProvider, useData } from './lib/store';
import { isRemote, preloadSignIn, signIn, signOut } from './lib/remote';
import { useRoute } from './lib/router';
import { ConfirmProvider, ToastProvider } from './components/overlay';
import { Layout } from './components/Layout';
import { Button, ErrorState, Skeleton } from './components/ui';
import { SessionUIProvider } from './features/sessions';
import Overview from './pages/Overview';
import Schedule from './pages/Schedule';
import Reminder from './pages/Reminder';
import Directory from './pages/Directory';
import SpProfile from './pages/SpProfile';
import Verification from './pages/Verification';
import Analytics from './pages/Analytics';
import Report from './pages/Report';
import Settings from './pages/Settings';

function Pages() {
  const route = useRoute();
  const { snap, loading, error, reload } = useData();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route.path]);

  if (error && error.code === 'UNAUTHENTICATED' && isRemote()) return <LoginScreen onDone={reload} />;
  if (error && (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED')) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-[26px] border border-line bg-white p-8 text-center shadow-soft">
          <Lock className="mx-auto size-8 text-pine" />
          <h1 className="display mt-3 text-[24px] font-semibold text-pine">無存取權限</h1>
          <p className="mt-2 text-[14px] text-ink-2">{error.message}</p>
          {isRemote() && <Button className="mt-4" onClick={() => { signOut(); reload(); }}>改用其他 Google 帳號登入</Button>}
        </div>
      </div>
    );
  }

  const page = (() => {
    switch (route.parts[0] || 'overview') {
      case 'schedule': return <Schedule route={route} />;
      case 'reminder': return <Reminder route={route} />;
      case 'sps': return route.parts[1] ? <SpProfile route={route} /> : <Directory />;
      case 'verify': return <Verification route={route} />;
      case 'analytics': return <Analytics route={route} />;
      case 'report': return <Report route={route} />;
      case 'settings': return <Settings />;
      default: return <Overview />;
    }
  })();

  return (
    <Layout route={route}>
      {!snap && loading && (
        <div aria-busy="true" aria-label="載入中" className="grid gap-4 md:grid-cols-12">
          <Skeleton className="h-24 md:col-span-12" />
          <Skeleton className="h-64 md:col-span-7" />
          <Skeleton className="h-64 md:col-span-5" />
          <Skeleton className="h-44 md:col-span-4" />
          <Skeleton className="h-44 md:col-span-8" />
        </div>
      )}
      {!snap && error && <ErrorState message={`無法載入資料：${error.message}`} onRetry={reload} />}
      {snap && (
        <>
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-[14px] bg-danger-50 px-4 py-2 text-[13px] text-danger">
              重新整理失敗：{error.message}
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={reload}>重試</Button>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={route.parts.slice(0, 2).join('/')} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              {page}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </Layout>
  );
}

/** 未登入時自動前往 Google 登入（已登入 Google 的瀏覽器不需輸入任何資料，會自動帶回系統） */
function LoginScreen({ onDone }: { onDone: () => Promise<void> }) {
  const [manual, setManual] = useState(false);
  useEffect(() => {
    void onDone;
    // 避免來回重導：同一分頁 30 秒內只自動嘗試一次，失敗時改顯示按鈕
    const last = Number(sessionStorage.getItem('sp-hub-auto-login') || 0);
    if (Date.now() - last < 30_000) return setManual(true);
    sessionStorage.setItem('sp-hub-auto-login', String(Date.now()));
    preloadSignIn();
    void signIn();
  }, [onDone]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-pine p-8 text-white shadow-lift">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Chi Mei · Clinical Skills</div>
        <h1 className="display mt-3 text-[30px] font-semibold leading-tight">SP Performance Hub</h1>
        <p className="mt-1 text-[14px] text-white/70">標準化病人演出歷程管理平台</p>
        {manual ? (
          <>
            <p className="mt-6 text-[14px] leading-relaxed text-white/80">請以已授權的管理員 Google 帳號登入。登入後 90 天內使用不需再登入。</p>
            <Button variant="gold" className="mt-6 w-full" onClick={() => { sessionStorage.removeItem('sp-hub-auto-login'); void signIn(); }}>
              以 Google 帳號登入
            </Button>
          </>
        ) : (
          <p className="mt-6 flex items-center gap-2 text-[14px] text-white/80">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-gold" />
            正在以 Google 帳號登入…
          </p>
        )}
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-10">
        <ErrorState message={`畫面發生錯誤：${this.state.error.message}`} onRetry={() => { this.setState({ error: null }); window.location.hash = '#/overview'; }} />
      </div>
    );
  }
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <ConfirmProvider>
          <DataProvider>
            <SessionUIProvider>
              <ErrorBoundary>
                <Pages />
              </ErrorBoundary>
            </SessionUIProvider>
          </DataProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
