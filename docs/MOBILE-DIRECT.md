# 手機網址直開設定（GitHub 網址在手機也能登入使用）

## 為什麼需要

GitHub 入口原本是「嵌入」Apps Script 頁面。iPhone Safari、LINE 等內建瀏覽器會封鎖嵌入頁的 Google 登入資訊（第三方 Cookie），所以手機無法辨識帳號。

「網址直開」改為：系統畫面直接在 `https://luyun1224.github.io/Chimei-SP/` 執行，按「以 Google 帳號登入」後，
用 Google 官方登入元件取得**你本人**的授權，再透過 **Apps Script API** 以你本人的身分執行後端（同一份 Code.gs）。
登入發生在頂層頁面，手機也能使用；讀寫試算表、日曆、權限檢查都和原本一樣在 Apps Script 執行。

不需要 Client Secret、不需要伺服器；設定檔中的 **Client ID 與 Script ID 都是公開識別碼，不是密鑰**。

---

## 一次性設定（約 15 分鐘）

### 1. 建立 Google Cloud 專案
1. 開啟 <https://console.cloud.google.com/>，以系統管理員帳號登入。
2. 上方專案選單 → **新增專案**，名稱例如 `SP Performance Hub` → 建立。
3. 記下 **專案編號（Project number）**：首頁「專案資訊」卡片中的一串數字。

### 2. 啟用 API
左側選單 **API 和服務 → 程式庫**，搜尋並啟用：
- **Apps Script API**
- **Google Sheets API**
- **Google Calendar API**

另外到 <https://script.google.com/home/usersettings> 確認「Google Apps Script API」為**開啟**。

### 3. 設定 OAuth 同意畫面
**API 和服務 → OAuth 同意畫面**（或「Google Auth Platform」）：
- 使用者類型：醫院 Workspace 帳號選「**內部**」；一般 Gmail 選「**外部**」。
- 應用程式名稱：`SP Performance Hub`，支援電子郵件填你的信箱。
- 範圍（Scopes）加入：`.../auth/spreadsheets`、`.../auth/calendar`、`.../auth/userinfo.email`。
- 選「外部」時，在「測試使用者」加入所有管理員的 Gmail（保持「測試中」狀態即可，最多 100 人，不需 Google 審查）。

### 4. 建立 OAuth 用戶端 ID
**API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID**：
- 應用程式類型：**網頁應用程式**
- 已授權的 JavaScript 來源：`https://luyun1224.github.io`
- 不需要重新導向 URI
- 建立後複製 **用戶端 ID**（`xxxx.apps.googleusercontent.com`）。**用戶端密鑰不需要、也不要貼到任何地方。**

### 5. 把 Apps Script 連到這個 Cloud 專案
Apps Script 編輯器 → **專案設定（⚙）**：
- 「Google Cloud Platform (GCP) 專案」→ **變更專案** → 輸入第 1 步的**專案編號** → 設定專案。
- 同一頁複製 **指令碼 ID（Script ID）**。

### 6. 更新 appsscript.json 並部署為「API 可執行檔」
1. 將 repo 中 `apps-script/appsscript.json`（含 `"executionApi": {"access": "ANYONE"}`）貼到 Apps Script 的 appsscript.json。
   若你原本的 `webapp.access` 是 `ANYONE`（一般 Gmail），請保留 `ANYONE`。
2. 貼上最新 `Code.gs` → 儲存。
3. **部署 → 新增部署作業 → 類型選「API 可執行檔」** → 存取權：任何人 → 部署。
   （原本的「網頁應用程式」部署保留不動；之後每次更新 Code.gs，兩種部署都要更新為新版本。）

### 7. 填入設定
把 **用戶端 ID** 與 **指令碼 ID** 填到 GitHub repo 的 `pages/config.js`：

```js
window.SP_HUB_REMOTE = {
  clientId: '1234567890-xxxx.apps.googleusercontent.com',
  scriptId: '1AbC...（指令碼 ID）',
};
```

推送後 GitHub Pages 會自動部署。或把兩個值傳給開發者代為填入。

---

## 使用方式
- 開啟 `https://luyun1224.github.io/Chimei-SP/` → 按「以 Google 帳號登入」→ 第一次會詢問授權 → 允許。
- 登入有效約 1 小時；逾時後會回到登入畫面，再按一次即可（通常不需重新輸入密碼）。
- 只有 Script Properties 中 `ADMIN_EMAILS` 名單內的帳號可以讀寫資料；其他人登入後只會看到「無存取權限」。
- 手機可在 Safari「分享 → 加入主畫面」，像 App 一樣開啟。

## 常見問題
| 狀況 | 處理 |
|---|---|
| 「Google 拒絕執行」 | 確認第 2 步 Apps Script API 已啟用、第 5 步專案編號正確、第 6 步已部署「API 可執行檔」 |
| 「此應用程式未經驗證」 | 外部＋測試模式的正常提示，按「繼續」；或確認帳號已加入測試使用者 |
| 登入視窗沒有跳出 | 手機瀏覽器擋了彈出視窗；請允許彈出視窗，或改用 Safari／Chrome 開啟 |
| 後端執行錯誤：Script function not found | 「API 可執行檔」部署的版本太舊，請部署新版本 |
