import { Component, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Lock, RefreshCw } from 'lucide-react';
import { DataProvider, useData } from './lib/store';
import { hasToken, isRemote, pairDevice, signOut, takePendingCode } from './lib/remote';
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
import Fees from './pages/Fees';

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
          {isRemote() && <Button className="mt-4" onClick={() => { signOut(); reload(); }}>重新綁定此裝置</Button>}
        </div>
      </div>
    );
  }

  if (route.parts[0] === 'bind') return <LoginScreen onDone={async () => { window.location.hash = '#/overview'; await reload(); }} />;
  const isPublic = snap?.access === 'public';
  const PUBLIC_PAGES = ['overview', 'schedule', 'analytics', 'report'];
  const page = (() => {
    const key = route.parts[0] || 'overview';
    if (isPublic && !PUBLIC_PAGES.includes(key)) return <Overview />;
    switch (key) {
      case 'schedule': return <Schedule route={route} />;
      case 'reminder': return <Reminder route={route} />;
      case 'sps': return route.parts[1] ? <SpProfile route={route} /> : <Directory />;
      case 'verify': return <Verification route={route} />;
      case 'analytics': return <Analytics route={route} />;
      case 'report': return <Report route={route} />;
      case 'fees': return <Fees />;
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

/** 第一次使用的裝置：輸入存取碼綁定一次，之後開網址直接進入儀表板 */
function LoginScreen({ onDone }: { onDone: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(false);
  // 由專屬網址開啟：自動綁定，直接進入儀表板
  useEffect(() => {
    const pending = hasToken() ? '' : takePendingCode();
    if (!pending) return;
    setAuto(true);
    pairDevice(pending)
      .then(() => onDone())
      .catch((e) => {
        setErr((e as Error).message);
        setAuto(false);
      });
  }, [onDone]);
  if (auto) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-6 text-[15px] text-pine">
        <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-pine/20 border-t-pine" />
        SP Performance Hub 載入中…
      </div>
    );
  }
  const submit = async () => {
    if (!code.trim()) return setErr('請輸入存取碼');
    setBusy(true);
    setErr('');
    try {
      await pairDevice(code);
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <form className="w-full max-w-md overflow-hidden rounded-[28px] bg-pine p-8 text-white shadow-lift" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Chi Mei · Clinical Skills</div>
        <h1 className="display mt-3 text-[30px] font-semibold leading-tight">SP Performance Hub</h1>
        <p className="mt-1 text-[14px] text-white/70">標準化病人演出歷程管理平台</p>
        <p className="mt-6 text-[14px] leading-relaxed text-white/80">第一次在這台裝置使用，請輸入<b className="text-white">存取碼</b>綁定裝置。綁定後，之後打開網址就直接進入，不需登入。</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="例：ABCD-2345"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          aria-label="存取碼"
          className="num mt-5 w-full rounded-[14px] border border-white/20 bg-white/10 px-4 py-3 text-center text-[22px] tracking-[0.3em] text-white outline-none placeholder:text-white/30 focus:border-gold"
        />
        <Button type="submit" variant="gold" className="mt-4 w-full" loading={busy}>綁定此裝置</Button>
        {err && <p role="alert" className="mt-3 rounded-[12px] bg-white/10 px-3 py-2 text-[13px] text-[#f6c7bf]">{err}</p>}
        <p className="mt-5 text-[12px] leading-relaxed text-white/50">使用「專屬網址」開啟就不需要輸入。專屬網址可在 Apps Script 執行 showAccessCode 查看，或由已綁定裝置的「系統設定」複製。請勿外流。</p>
      </form>
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
