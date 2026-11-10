import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

/** 允許嵌入本系統的外層網站；其他網站以 iframe 嵌入時拒絕顯示（防點擊劫持） */
const ALLOWED_ANCESTORS = [
  /^https:\/\/script\.google\.com$/,
  /^https:\/\/[\w-]+\.googleusercontent\.com$/,
  /^https:\/\/luyun1224\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
];

function framedByUnknownSite(): string | null {
  const ao = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (!ao) return null; // 不支援的瀏覽器（如 Firefox）不檢查
  for (let i = 0; i < ao.length; i++) {
    if (!ALLOWED_ANCESTORS.some((re) => re.test(ao[i]))) return ao[i];
  }
  return null;
}

const root = document.getElementById('root')!;
const bad = framedByUnknownSite();
if (bad) {
  root.textContent = `為保護資料安全，本系統不允許在此網站（${bad}）中嵌入顯示。`;
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
