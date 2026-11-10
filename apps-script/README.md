# Apps Script 貼上版（不用安裝任何工具）

這個資料夾是已經編譯好的 Apps Script 檔案，可直接複製貼到 Apps Script 編輯器。
（由 `npm run build` 產生；原始碼在 `server/` 與 `src/`，修改後請重新建置再貼上。）

| 檔案 | 在 Apps Script 編輯器中 |
|---|---|
| `Code.gs` | 貼到預設的 `程式碼.gs`（Code.gs），取代全部內容 |
| `index.html` | 按「＋」→ **HTML**，檔名輸入 `index`（不要加 .html），貼上全部內容 |
| `appsscript.json` | 專案設定 → 勾選「在編輯器中顯示 appsscript.json」→ 開啟 appsscript.json，取代全部內容 |

接著依照 `docs/DEPLOY.md` 第 3 步之後操作：執行 `setupSpreadsheet` → 設定 `ADMIN_EMAILS` → 設定 Calendar ID → 部署為網頁應用程式。
