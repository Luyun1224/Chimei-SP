// 「網址直開」設定（手機也能直接用 GitHub 網址登入使用）
// 兩個值都是公開識別碼，不是密鑰；設定方式見 docs/DEPLOY.md「手機網址直開」。
// 留白時，入口頁會沿用嵌入 Apps Script 的方式。
window.SP_HUB_REMOTE = {
  clientId: '',  // Google Cloud OAuth 用戶端 ID，例如 1234567890-xxxx.apps.googleusercontent.com
  scriptId: '',  // Apps Script「專案設定」中的指令碼 ID
};
