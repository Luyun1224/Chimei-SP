# Apps Script 貼上版（只需要 Code.gs，不需要 index.html）

前端畫面（app.js / app.css）部署在 GitHub Pages：<https://luyun1224.github.io/Chimei-SP/app/>。
Apps Script 的 `doGet` 只回傳一小段 HTML 去載入它們，因此 Apps Script 專案中**不需要 index.html**。
頁面仍由 Apps Script 提供，資料讀寫照常以管理員本人的 Google 身分透過 `google.script.run` 執行，安全模型不變。

| 檔案 | 在 Apps Script 編輯器中 |
|---|---|
| `Code.gs` | 貼到「程式碼.gs」，取代全部內容 |
| `appsscript.json` | 專案設定 → 勾選「在編輯器中顯示 appsscript.json」→ 取代全部內容 |

- 之後修改畫面：推送到 GitHub 即自動更新，**不必**重貼 Apps Script（最多約 10 分鐘生效）。
- 修改後端（server/）：執行 `npm run build` 後重貼 `Code.gs`，並在「管理部署作業」發佈新版本。
- 若要改用其他網址提供前端：在 Script Properties 設定 `APP_BASE_URL`（必須是 https）。

## 試算表綁定

請從資料用的 Google 試算表開啟「擴充功能 → Apps Script」，再貼上 `Code.gs`。
綁定後系統一律使用該試算表，執行 `setupSpreadsheet` 只會在這個試算表內建立／補齊工作表，不會另外產生新檔。
