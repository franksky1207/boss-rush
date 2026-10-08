# 0.9.0 美術資源

21 張主要圖片已製作並接入：勇者四姿態、五王各兩姿態、終焉魔王狂暴兩姿態、五背景。來源為本專案以 OpenAI image generation 製作的原創角色與場景，不引用外部遊戲人物。每個 Boss 攻擊圖以自身待機圖作為參考。PNG 原稿保留執行環境 /workspace/generated_images，部署使用保留 alpha 的 WebP，quality 85。

| 資源 | 張數 | bytes |
|---|---:|---:|
| final-overlord | 2 | 659,200 |
| final-overlord-berserk | 2 | 736,258 |
| flame-general | 2 | 740,974 |
| iron-guard | 2 | 684,980 |
| shadow-assassin | 2 | 553,556 |
| silver-knight | 4 | 1,009,580 |
| void-lord | 2 | 746,686 |
| 五張背景 | 5 | 1,211,614 |

圖片合計 6,342,848 bytes，約 6.05 MiB。不是進入首頁就下載全部圖片，依關卡／姿態載入。角色畫布皆 1024×1536，背景實際生成 1672×941（接近 16:9；未宣稱是建議尺寸 1920×1080）。背景以 cover 置中裁切，手機保留中央場景。

逐角色 metadata.json 與 assets/metadata-v0.9.0.json 保存來源、SHA-256、透明範圍、腳底錨點、畫布、比例與面向。虛空領主及終焉魔王兩型態在呈現層鏡像，使施法／攻擊朝向左側勇者；沒有修改原稿。Boss 防禦／受傷採待機圖搭配程式演出，不冒充另有姿態素材。

prototypes 留作歷史資源，正式入口已不引用。fonts 保存本機 Noto Serif TC 子集與 SIL OFL 1.1 授權。

圖片全部已製作與整合，仍需使用者畫風確認與實體裝置辨識度／載入驗收；不等同正式發布或跨瀏覽器驗收全部完成。
