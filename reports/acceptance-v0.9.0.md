# 0.9.0 美術、字體與特效驗收

一次製作並整合全部剩餘 17 張主要圖片：五王各待機／攻擊 10 張、終焉魔王狂暴兩姿態、五背景。與既有勇者四姿態合計 21 張。新圖具來源、SHA-256、尺寸、透明邊界及個別腳底錨點紀錄；虛空領主及終焉魔王兩型態在呈現層鏡像，確保朝向勇者。

角色 1024×1536 透明 WebP，背景 1672×941 WebP（原生生成尺寸接近16:9）；沒有將它們描述為建議尺寸1920×1080。WebP quality85，圖片合計6,342,848 bytes；本機 Noto Serif TC 子集468,100 bytes，SIL OFL1.1授權隨專案保留。原PNG在執行環境 generated_images保留，遊戲部署不用原PNG。

標題、招式、角色名、行動使用繁體襯線字；介面及數字維持清楚字體。加強光弧、光盾、衝擊環、火花與魔王能量，新增判定、連擊與浮動傷害文字。動態值全部由同一遊戲時計取樣，無CSS自走動畫、setTimeout或額外rAF。暫停凍結，退出清除，降低特效移除粒子與浮動／縮放但保留必要文字。修正舊提示固定扣20／30，依三難度的實際扣血顯示。

## 實際檢查

- npm run verify：58項全部通過、零略過。九模組／一樣式／一本機字體／21圖片的相對路徑與v=0.9.0全部一致，.nojekyll存在。
- visual-browser.mjs：七尺寸×四行動，角色比例／錨點／裁切／核心文字不遮擋／暫停／復位／連點通過；受傷圖載入、原型武器隱藏、旋轉與圖片失敗安全降級通過；素材失敗不產生重試迴圈。
- boss-browser.mjs：1280×720、1024×768、360×640、667×320完整五王，新背景／立繪／比例／招式限制／單次狂暴／2秒時限／暫停／通關重玩通過。
- presentation-browser.mjs：本機字體確實載入，戰鬥粒子及判定／傷害／連擊文字、暫停／恢復凍結、降低特效、退出清理、三難度選錯／超時提示、字體載入失敗降級通過。新增測試初版在超時演出結束後才查看文字，已改成觀察超時發生後取樣並重跑通過。
- difficulty-browser.mjs：手機三難度選擇／扣血／死亡／結算／重玩沿用／退出／分榜與舊紀錄相容通過。
- stress-browser.mjs：八活動階段暫停／退出取消／恢復、200次新局／退出，保持一條rAF與零遊戲timeout／interval，過期操作拒絕與倒數邊界通過。
- 17張新增圖片SHA-256與metadata逐一吻合，角色alpha背景0、主體最高254，角色無邊界截斷。字體包含主要繁體招式／角色／模式字元，無執行期外部字體請求。
- 字體及代表性背景本機HTTP200，MIME為font/woff、image/webp；git diff --check通過。

## 截圖

[主畫面](screenshots-v0.9.0/home.png) · [手機戰鬥與文字效果](screenshots-v0.9.0/mobile-impact.png) · [桌面戰鬥與文字效果](screenshots-v0.9.0/desktop-impact.png)

| Boss | 橫向 | 直向 |
|---|---|---|
| 鐵甲守衛 | [桌面](screenshots-v0.9.0/1280x720-boss1.png) | [手機](screenshots-v0.9.0/360x640-boss1.png) |
| 暗影刺客 | [桌面](screenshots-v0.9.0/1280x720-boss2.png) | [手機](screenshots-v0.9.0/360x640-boss2.png) |
| 烈焰魔將 | [桌面](screenshots-v0.9.0/1280x720-boss3.png) | [手機](screenshots-v0.9.0/360x640-boss3.png) |
| 虛空領主 | [桌面](screenshots-v0.9.0/1280x720-boss4.png) | [手機](screenshots-v0.9.0/360x640-boss4.png) |
| 終焉魔王 | [桌面](screenshots-v0.9.0/1280x720-boss5.png) | [手機](screenshots-v0.9.0/360x640-boss5.png) |
| 終焉魔王狂暴 | [桌面](screenshots-v0.9.0/1280x720-boss5-berserk.png) | [手機](screenshots-v0.9.0/360x640-boss5-berserk.png) |

## 尚待驗收

全部圖片已製作並整合，仍待使用者整體畫風確認、實體手機辨識度與載入時間、真人難度試玩、Safari／Firefox驗收。GitHub Pages遠端設定曾回覆Forbidden，未確認啟用狀態；本批未提交、推送或發布。三難度、HP／傷害公式／時限／抽招／排行榜規則均維持原決策，不以美術通過宣稱完整正式發布驗收完成。
