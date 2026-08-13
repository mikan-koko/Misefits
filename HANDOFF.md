# HANDOFF.md — 設計・アーキテクチャ詳細

`index.html`（単一ファイル・バニラJS）の内部構造メモ。行番号は目安（編集で前後する）。

## 全体構成

- `<head>`: CDN スクリプト（Fabric 5.3.1 / pdf.js 3.11.174 / jsPDF 2.5.1）とインライン CSS。
- `<body>`: ヘッダー（保存/読込/PNG/PDF/印刷、モバイルは ☰）、サイドバー（シート・縮尺・グリッド・什器ライブラリ・操作・出力）、ワークスペース（`#c` キャンバス＋空状態＋ヒント＋校正バナー＋プロパティパネル＋ズームバー）。
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

## テスト観点（回帰で壊れやすい所）

- 実寸の往復一致（入力1200 → 表示1200, φ含む）
- 縮尺変更で既存什器の実寸が保たれる
- シート切替で配置が保持される
- モバイル：移動モードで `hasControls=false`、ピンチでズーム値が増減、パネルがコンパクト/移動中非表示
- PDF が有効（先頭が `%PDF-`）で図面＋配置が用紙にフィット
- どの操作でも `pageerror` が出ない
