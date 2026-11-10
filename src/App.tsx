import { Component, useEffect, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Lock, RefreshCw } from 'lucide-react';
import { DataProvider, useData } from './lib/store';
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

  if (error && (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED')) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-[26px] border border-line bg-white p-8 text-center shadow-soft">
          <Lock className="mx-auto size-8 text-pine" />
          <h1 className="display mt-3 text-[24px] font-semibold text-pine">無存取權限</h1>
          <p className="mt-2 text-[14px] text-ink-2">{error.message}</p>
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
