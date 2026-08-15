# HANDOFF.md — 設計・アーキテクチャ詳細

`index.html`（単一ファイル・バニラJS）の内部構造メモ。行番号は目安（編集で前後する）。

公開URLは `https://misefits.kokokikaku.com/`。GitHub Pages のカスタムドメインとして、リポジトリ直下に `CNAME`（`misefits.kokokikaku.com`）を置く。DNS側では `misefits` の CNAME を `mikan-koko.github.io` に向ける。

## 全体構成

- `<head>`: CDN スクリプト（Fabric 5.3.1 / pdf.js 3.11.174 / jsPDF 2.5.1）とインライン CSS。
- `<body>`: ヘッダー（保存/読込/PNG/PDF/印刷、モバイルは ☰）、サイドバー（シート・縮尺・グリッド/吸着・計測・什器ライブラリ・操作・集計・出力）、ワークスペース（`#c` キャンバス＋空状態＋ヒント＋校正バナー＋プロパティパネル＋アクションバー＋ズームバー）。
- `<script>`: 状態・ライブラリ定義・全ロジック（インライン）。

## 状態モデル

```js
const project = {
  sheets: [{
    name, image /* dataURL */, mmPerPixel, calibrated /* bool */,
    objects /* Fabric の toJSON().objects */,
    _imgW, _imgH /* 背景画像の実ピクセル（fitView/エクスポートで使用） */
  }],
  active /* index, 未選択は -1 */
};
```

- 1つの Fabric `canvas` を全シートで共有。シート切替時に現在の配置を `syncActiveObjects()` で `sheet.objects` に退避し、対象シートの背景と `objects` を復元（`switchSheet()`）。
- 背景は `canvas.backgroundImage`（scale 1, 原点0,0）。ナビゲーションは `viewportTransform` のズーム/パンで行う。

## 什器ライブラリ

- `LIBRARY`（カテゴリ配列）と `ITEM_INDEX`（key→item）。item は `{key,name,shape:'rect'|'circle'|'text', w,d, color, category}`。
- `makeFixture(item)`: rect は Rect+Text、circle は Circle+Text の `fabric.Group`。`group.data` に `{key,name,shape, realW,realD, baseW,baseH}` を保持。`baseW/baseH` は「線幅を含まない px 寸法」。
- 追加は `addFixture(key,pos)`。クリックで中央、サイドバーからのドラッグ＆ドロップ（`text/fx` データ）にも対応。

## 実寸の算出（重要）

- `objRealSize(o)`: `data.baseW * |scaleX| * mmPerPixel`, `data.baseH * |scaleY| * mmPerPixel`。circle は φ（`w` を直径として使用）。text は寸法なし。
- 逆変換（数値入力→サイズ）: `applyProps()` が `scaleX = (wmm/mmPerPixel)/baseW` を設定。→ 入力と表示が往復一致（1200→表示1200）。
- 縮尺変更時（`applyCalibration`）は各 `data.realW/realD` を保って px を再計算（実寸を保存）。

## 編集履歴（Undo / Redo）

- スナップショット方式。`historySnapshot()` が `{mmPerPixel, calibrated, objects}` を JSON 文字列化し、**シートごと**に `sheet._hist` / `sheet._histIdx` として保持（上限 `HISTORY_LIMIT=50`）。
- `autosave()` の先頭で `historyPush()` を呼ぶため、**変更を伴う操作は自動的に履歴へ乗る**（autosave を呼ぶのが実質的な「変更あり」のマーカー）。
- `historyPush()` は 350ms の debounce（スライダー等の連続操作を1件にまとめる）。追加・削除・複製・回転・重ね順・移動完了(`object:modified`)・縮尺変更のような**確定操作は `historyMark()` で即座にコミット**する。
- `historyApply()` は `historyLock=true` の間にオブジェクトを差し替えるので、復元中の `autosave()` は履歴に積まれない。計測/縮尺モード中は `setObjectsInteractive(false)` を維持する。
- `_hist` / `_meas` は内部プロパティ。保存は `serializeProject()` を通し、localStorage / JSON には出さない（履歴でストレージが膨らむのを防ぐ）。
- UI: ワークスペース右下のアクションバー（`#actionBar`）の ↶ / ↷、`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`。

## 吸着（スナップ）と計測

- `computeSnap(o)`（`object:moving` から呼ぶ）: 移動中オブジェクトの AABB の 左/中心/右・上/中心/下 を、他オブジェクトの同じ6値と図面外周（`0..(_imgW/_imgH)`）に照合し、`9/zoom`（シーン座標）以内で最も近いものへ吸着。`snapGuides` に記録し `drawSnapGuides()` がピンクの破線を描く。軸ごとに、吸着しなかった側だけグリッド吸着を適用。
- 計測ツール: `startMeasure()/measClick()/clearMeasures()`。2点クリックで線分を `sheet._meas` に積み、`drawMeasures()` が実寸ラベル付きで描画。**通路幅の目安で色分け**（<600mm 赤 / <900mm 橙 / それ以上 緑, `AISLE_TIGHT`・`AISLE_OK`）。計測線はオーバーレイ描画なので保存・PNG/PDF出力には含まれない。
- 計測/縮尺モード中は `setObjectsInteractive(false)` で什器を掴めないようにする（誤移動防止）。`Esc` または `M` キーで解除。

## 集計（席数・面積）

- `computeSummary()` が席数・パーツ数・什器の合計面積(mm²)・シート面積・占有率・内訳を返す。`updateSummary()` がサイドバー `#summaryBox` に描画し、`updateWorkStatus()` から毎回呼ばれる。
- 席数は `SEAT_COUNT`（key→席数）と `SEAT_PER_MM`（カウンター席＝幅600mmごとに1席）から算出。ここを直せば席数の定義を調整できる。
- 面積は円は πr²、矩形は W×D。シート面積は白紙シートなら `realW×realH`、図面なら `_imgW×_imgH×mmPerPixel²`（余白込みなのでUI上もそう表記）。
- PDF フッターにも ASCII で `Fixtures / Seats / Fixture area` を追記している。

## クイックパーツ（モバイル）

- アクションバー内の `#quickParts`（モバイルのみ表示）。`recentKeys()` が localStorage `misefitsRecentParts` の使用履歴＋`DEFAULT_QUICK` を混ぜて最大8件を返し、`addFixture()` のたびに `pushRecent()` で更新。末尾の「＋ 一覧」はドロワーを開く。

## 縮尺キャリブレーション

`startCalibration()` → キャンバス上2点クリック（`calClick`）→ 実距離(mm)を prompt → `mmPerPixel = mm / pixelDist`（`applyCalibration`）。Esc で中断。既存什器は実寸維持で再スケール。

## グリッド・寸法表示

- `drawGrid()`: `after:render` で `viewportTransform` を適用し、`gridMM/mmPerPixel` 間隔で薄い線を描画（細かすぎる時は非表示）。
- `drawDimBadge()`: **選択中（タップ中）オブジェクトのみ** 実寸バッジ（`1200 × 700 mm ∠角度`）を描画。※以前は全什器に常時薄表示していたが、要望により選択時のみに変更（`drawAllDimLabels` は削除済み）。

## 操作モード（誤リサイズ対策・モバイル）

- `handleMode`（true=サイズ/回転ハンドル有効, false=移動のみ）。タッチ既定は false（`IS_TOUCH` 判定）。
- `applyObjMode(o)` が `o.hasControls = handleMode` を設定。`false` だとハンドルが出ず、ドラッグは移動のみ＝幅を誤変更しない。サイズ/角度は下パネルの数値で変更。
- プロパティパネル上部の「🖐 移動 / ⤢ サイズ・回転」で切替（`setHandleMode`）。
- `canvas.targetFindTolerance`：タッチ 18 / それ以外 4。小さい什器やズレたタップでも選択しやすく。

## モバイル対応

- ブレークポイント `@media (max-width:860px)`、`isMobile()` で JS 分岐。
- サイドバーは ☰ ドロワー（`openDrawer/closeDrawer/toggleDrawer` + `#backdrop`）。図面や什器を追加すると自動で閉じる。
- 高さは `100dvh`。ズームバーは右上（下部パネルと干渉させない）。
- ピンチズーム/2本指パン: `setupPinch()` が `upperCanvasEl` に capture フェーズで touch を張り、2本指時は `preventDefault + stopPropagation` で Fabric を抑止。`pinch` 状態で `mouse:*` パンを無効化。1本指の空所ドラッグはパン（`IS_TOUCH && !opt.target`）。
- プロパティパネルは既定コンパクト（`props.collapsed`＝名前＋モード切替のみ、約15%高）。「詳細▾」で `#propsDetails`（W/D・角度・複製/削除）を展開。移動中は `props.dragging` で一時非表示（`object:moving` 付与 / `mouse:up`・`object:modified` 解除）。

## 保存・読込・出力

- `saveProject()`/`loadProjectData()`: プロジェクト全体を JSON で入出力（`toJSON(['data'])` で `data` を含める）。`autosave()` は localStorage にデバウンス保存、`tryRestore()` が起動時に復元確認。
- `renderComposite(cb, multiplier)`: オフスクリーン `fabric.StaticCanvas` に背景＋`objects` を復元して合成（グリッド無し, 既定 multiplier=2）。PNG/PDF/印刷の共通土台。
- `exportPNG()` / `exportPDF()`（用紙 `#paperSize` a4/a3/a5/letter・向き自動フィット, フッターはASCIIの縮尺表記）/ `printLayout()`（非表示 iframe に画像を書き出して `print()`）。
- ダウンロードは `triggerDownload()`（アンカーを一時 DOM 追加、blob は revoke）。

## 主なイベント（`wireCanvas`）

- `after:render` → `drawGrid()`, `drawDimBadge()`
- `mouse:down/move/up` → 校正クリック / パン（Space or タッチ空所）
- `mouse:wheel` → ズーム
- `object:moving` → グリッドスナップ＋パネル一時非表示 / `object:rotating` → 15°スナップ（`#snapRot`, Shiftで反転） / `object:scaling`・`object:modified` → プロパティ更新・autosave
- `selection:created/updated/cleared` → プロパティパネル表示制御

## 変更履歴（要点）

1. 初版：図面アップ/縮尺/実寸配置/什器ライブラリ/保存・PNG、GitHub Pages 公開。
2. 回転・角度調節UI（数値・スライダー・±15/±45/90/0°・15°スナップ・R/[ ]）。
3. スマホ・タブレット対応（☰ドロワー、ピンチ、1本指パン、`100dvh`、レスポンシブ）。
4. PDF出力・プリンター印刷（用紙選択・向き自動、`renderComposite` 共通化）。
5. 丸テーブル（2人φ600 / 4人φ900）追加、ライブラリのプレビューを実寸比に。
6. スマホのズームバー右上化・見切れ対策。什器寸法をタップ時のみ表示。
7. モバイルの移動/サイズ切替モード・タップ判定拡大。プロパティパネルのコンパクト化＋移動中の一時非表示。
8. MiseFits としてリリース準備（ブランド・カスタムドメイン・OGP/構造化データ・ヒーロースライダー・フッター）。
9. Undo/Redo、什器・壁への吸着ガイド、通路幅の計測ツール、席数・面積の自動集計、モバイルのクイックパーツバーを追加。

## 静的ページとアクセス解析

- `guide.html`（使い方）・`privacy.html`（プライバシー/免責）・`404.html` は、それぞれ単体で完結した静的HTML。CSSはインライン、外部スクリプトはGAローダーのみ。
- GAローダーは4ファイルに同一のものを配置。`GA_ID` が空なら何も読み込まない。`misefitsAnalyticsOptOut`（localStorage）と Do Not Track を尊重し、`privacy.html` に切り替えUIがある。CSPは `www.googletagmanager.com` / `*.google-analytics.com` を許可済み（テスト用IDで読み込み・collect ともに違反ゼロを確認済み）。
- アプリのフッターはシェルの一部として常時表示。スマホでは1行（約45px）に圧縮し、説明文と免責文は `privacy.html` に集約している。

## 白紙シートの形状（矩形／L字／コの字）

- 「白紙から」ボタンは `createBlankSheet()` → `openShapeModal()` を呼ぶだけの薄いラッパー。実際の作成フローは形状選択モーダル（`#shapeModalBackdrop`）。
- 形状は `shapeState = {type:'rect'|'L'|'U', W, D, nw, nd, corner|side}` で管理。`shapeVertsMm(state)` が mm単位の頂点配列（時計回り、原点は左上・Y下向き）を返す。L字は `lVerts()`（4隅から矩形の欠けを1つ取る）、コの字は `uVerts()`（4辺のいずれかの中央に開口を作る）。
- 実寸面積は `polygonAreaMm()`（シューレース公式）。矩形以外は `sheetArea = realW*realD` ではなく、この実面積を `sheet.realArea` に保存し、`computeSummary()`・`updateScaleBox()` はこちらを優先する（`realArea` が無い＝旧データ/矩形は `realW*realD` にフォールバックするので後方互換）。
- 背景ラスターは `drawShapeRaster()` が生成：輪郭の内側だけ白＋グリッド、外側（矩形の欠け部分）は薄いグレー（`#e7ebf1`）で塗る。什器はこの範囲外にも物理的には置けてしまう（Fabric側で制約していない）ので、欠け部分はあくまで視覚的な目安。
- モーダル内のプレビュー（`#shapePreviewCanvas`）は毎回の入力変更で `renderShapePreview()` が再描画。実際の書き出し用ラスターとは別の軽量描画（グリッド無し）。
- **有料プラン候補（未実装）**：頂点を自由にドラッグ編集できる完全自由形状エディタ、および読み込んだPDF/画像の上に実寸の輪郭をトレースする機能。今回はどちらも見送り、白紙シート専用のプリセット止まり。
- 什器・壁への吸着（`computeSnap()`）は現状 **矩形の外周（0..`_imgW`/`_imgH`）にしか吸着しない**。L字/コの字の欠け部分の辺には吸着しない（既知の制限）。

## 削除まわり

- パーツ: `deleteSel()`（選択削除）と `clearFixtures()`（シート内を一括削除・確認あり）。どちらも `historyMark()` を呼ぶので Ctrl+Z で戻せる。
- 計測: 計測モード中のクリックで `measureHitTest()` がヒットすれば、その線だけ削除（`distToSegment` で判定、閾値 12/zoom）。`undoLastMeasure()` は最後の1本、`clearMeasures()` は全消し（2本以上なら確認）。計測は編集履歴の対象外なので Undo では戻らない。

## テスト観点（回帰で壊れやすい所）

- 実寸の往復一致（入力1200 → 表示1200, φ含む）
- 縮尺変更で既存什器の実寸が保たれる
- シート切替で配置が保持される
- モバイル：移動モードで `hasControls=false`、ピンチでズーム値が増減、パネルがコンパクト/移動中非表示
- PDF が有効（先頭が `%PDF-`）で図面＋配置が用紙にフィット
- どの操作でも `pageerror` が出ない
- Undo/Redo：追加を3回 → 3回戻せる（1回1操作）、シートごとに履歴が独立、localStorage に `_hist` が入らない
- 吸着：什器の辺どうしが揃い、ガイド線が出る／計測：2点クリックで mm が出て 600・900mm で色が変わる
- 集計：4人テーブル=4席、カウンター席1800mm=3席、占有率が出る
