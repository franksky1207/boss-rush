# 0.9.1 發布與驗收

0.9.0 已推送，使用者已確認可試玩。0.9.1 更新採 main 推送後自動測試與部署；本環境 GitHub API 與網站 HTTP 受限，須以 Actions 結果確認遠端更新。

使用 Node.js 24、Python 3；`npm ci` 安裝鎖定的 Playwright 1.62.1 開發依賴。遊戲本身是靜態網站，不需要伺服器套件或執行期外部字體服務。

```sh
npm ci
npm run verify
npm run build
npm run validate:release
```

產物為 `dist/boss-rush`，包含 35 個必要檔案與一份 SHA-256 清單；包含字體 OFL 授權，不含測試、報告或占位素材。發布檢查核對精確清單、每個檔案內容、來源版本及授權。build 只重建此固定目錄。

## GitHub Pages

準備的 `.github/workflows/pages.yml` 在 main 推送、PR 或手動執行時驗證 Chromium、Firefox、WebKit，測試實際產物的 `/boss-rush/` 路徑。三引擎成功後才產生 Pages artifact。此工作流程尚未在 GitHub 執行，跨引擎相容性仍待結果確認。

經使用者授權推送後，在儲存庫 Settings → Pages 將 Source 設為 GitHub Actions。main 推送後通過全部檢查即自動部署；也可在 main 手動執行且勾選 `publish=true`。手動不勾選時只驗證，PR 不會發布。預期網站路徑為 `https://franksky1207.github.io/boss-rush/`，目前沒有確認此網址已提供新版。

部署後以實體手機／桌機核對三難度、五王、字體與素材載入、旋轉／背景暫停、排行榜重載、音效及降低特效。另確認 Network 沒有 404、載入版本為 0.9.1。

## 雲端浏览器驗收

```sh
npx playwright install chromium firefox webkit
python3 -m http.server 8001 --bind 127.0.0.1 --directory dist
```

另開終端，以 `BOSS_RUSH_TEST_URL=http://127.0.0.1:8001/boss-rush/ BOSS_RUSH_BROWSER=firefox npm run test:browser` 測試；引擎可改 chromium 或 webkit。同樣可執行 `test:bosses`、`test:presentation` 及其餘 browser 測試。score-browser 的 CDP 音訊／CPU 檢查限 Chromium。

本環境 Firefox 安裝被下載網域限制拒絕（403 Domain forbidden），安裝程序尚未進入 WebKit 下載。環境設定草稿已加入 `cdn.playwright.dev`、`playwright.download.prss.microsoft.com`；需在環境設定檢視、儲存並發布後，於套用新設定的環境重新安裝及驗收。草稿儲存不代表目前網路設定已變更。
