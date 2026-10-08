# 0.9.2 iPhone 音訊輸出修正

使用者確認其他App與影片有聲，但遊戲無聲。無實體iPhone可重現，不能斷言唯一原因；上一版的AudioContext與非零訊號驗證不足以保證裝置出聲。

iPhone／iPad改由Web Audio → MediaStreamAudioDestination → 原生HTMLAudioElement輸出，將聲音交給手機媒體播放路徑；可用時另設定navigator.audioSession.type=playback。桌面與其他裝置保留Web Audio直接輸出。媒體play與context.resume直接於使用者手勢呼叫，避免先await失去啟動權限；拒絕播放可重試，不回退到可能無聲的直接路徑。不下載外部音檔、不添加遊戲計時器、不更動判定規則。

設定新增0.9.2版本與音訊狀態，以辨識部署／快取與播放拒絕。所有引用同步0.9.2。60單元測試通過，零略過；build與發布清單／雜湊檢查通過。新增瀏覽器驗收模擬iPhone辨識並在Chromium實際使用原生MediaStream與HTMLAudio，確認live音軌、播放狀態、試聽音源、靜音／恢復及單一媒體輸出通過；不等同Safari／實體iPhone驗收。

main更新觸發既有三引擎CI與Pages部署。此環境無法讀取GitHub Actions／正式網站，尚未確認新版部署成功；須在遊戲設定確認版本0.9.2，再由使用者回報實際是否出聲，若仍無聲提供設定內的音訊狀態文字。
