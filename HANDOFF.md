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
10. iOSアプリ化（`mobile/` に Expo + WebView ラッパーを追加）に向けて、ネイティブ連携フックを追加。

## ネイティブアプリ連携（Pro機能・iOSアプリ向け）

- `index.html` 内、状態初期化部分（`const project = ...` の直前）に `window.MiseFitsNative` /
  `isPro()` / `handleNativeMessage()` / `requestProPurchase()` を定義。Web版はこのメッセージを
  一切受け取らないため常に `pro:false` のまま、従来通りの無料版として動作する（Web版の挙動に変更なし）。
- iOSアプリ（`mobile/`。Expo + `react-native-webview`）側から `{type:'entitlement', pro, uid}` を
  `postMessage`（`injectJavaScript` 経由で `window.handleNativeMessage()` を直接呼ぶ）すると
  `window.MiseFitsNative.pro` が更新され、`misefits:entitlement-changed` イベントが発火する。
  今後Pro限定機能を実装する際は、この `isPro()` で分岐させる。
- Web側からネイティブへは `requestProPurchase()`（`window.ReactNativeWebView.postMessage(...)`）で
  購入導線を要求する。Web版（`window.ReactNativeWebView` が存在しない）では `showHint()` で
  「iOSアプリ版のPro機能です」と案内するだけに留める。
- アプリ側の実装・ビルド手順は `mobile/README.md` を参照。`mobile/` は `index.html` を
  フォークせず、`mobile/scripts/build-webapp-bundle.js` がCDN依存のローカル同梱・CSP調整のみを
  行った `mobile/assets/webapp/index.html` を自動生成して読み込む（ロジックは共有）。
- 課金（RevenueCat）・クラウド保存（Firebase）・Pro限定機能（自由形状エディタ／トレース等）は
  まだ未実装。以下の課金設計（2026-08-25確定）に沿って実装する。

### 課金設計（確定・2026-08-25）

「継続コストがかかるかどうか」で買い切りとサブスクを分けるハイブリッド方式。

- **買い切り「MiseFits Pro」（非消費型IAP・単一バンドル・¥1,480）**：サーバー不要な機能をまとめて1商品にする。
  1. 自由形状エディタ（頂点を自由にドラッグ編集できる完全自由形状シート作成）
  2. PDF・画像トレース（アップロードした図面の上を実寸でなぞって輪郭を作成）
  3. 什器ライブラリ拡張（追加カテゴリ・什器アイテム）
  4. 透かし無し高解像度PNG/PDF出力
  5. 実寸スケール印刷（1:50等、用紙サイズに厳密フィット）
  6. メモ・コメント機能（📌付箋アイコンを図面上の任意位置に配置し複数行テキストを編集。什器とは別レイヤーで
     常に前面表示、集計（席数・面積）には含めない。サイドバーに「メモ一覧」を表示しクリックでジャンプ。
     PNG/PDF出力にも含める＝計測線と違い成果物の一部として扱う。既存の自由図形「テキスト」`free_text`
     は什器と同じ扱いの単なるラベルで無料版のまま、これとは別機能）
- **サブスク「クラウド保存」（自動更新・月額¥480／年額¥4,800）**：複数端末間の同期・バックアップのみ。
  年額は月額換算で2ヶ月分お得（誘導価格）。Firebase運用費が発生する唯一の機能なのでサブスクに残す。
  什器ライブラリ拡張はサーバー不要なため買い切り側に含めた（当初案からの変更点）。
- Apple手数料はSmall Business Program適用で15%想定（年間売上$100万未満）。
- 実装時は現状の単一 `pro: boolean` フラグでは表現できないため、`handleNativeMessage()` の
  `entitlement` メッセージを `{unlockPro: boolean, cloudSync: boolean, uid}` の2フラグ構成に拡張する。
  RevenueCat側もエンタイトルメントを `unlock_pro`（非消費型）と `cloud_sync`（サブスク）の2つに分ける。

### Web版での買い切り販売（iOSアプリとは別売り・実装済み・2026-08-26）

Web版（misefits.kokokikaku.com）でも「MiseFits Pro」買い切り（¥1,480・クラウド保存サブスクは対象外、
買い切りのみ）をサイト上で決済まで完結させる。iOSアプリからWebへの誘導導線は不要（スマホ新法の外部決済
リンク対応は現時点では不要と判断）。**Apple/RevenueCatとは完全に独立した別売り**。

バックエンドは当初Cloudflare Workers + KVで設計したが、iOSのクラウド保存機能でどのみちFirebase
プロジェクトが必要になるため、**Firebase Cloud Functions（2nd gen）+ Firestore に一本化**した
（アカウント管理を1プロジェクトに集約するため。2026-08-26変更）。

- **決済**：Stripe Payment Links（コード不要でダッシュボードから¥1,480の固定価格リンクを作成）。
  `after_completion` を「Webサイトへリダイレクト」にし、URLに`{CHECKOUT_SESSION_ID}`プレースホルダーを
  含める（Stripe公式サポート機能。決済直後に自サイトへセッションIDを渡せる）。手数料は3.6%程度で、
  Apple経由の15%より大幅に安い。
- **バックエンド**：`functions/index.js`（Firebase Functions v2・Node.js）。
  1. `stripeWebhook`：Stripeの`checkout.session.completed`をWebhookで受信。`stripe.webhooks.constructEvent(req.rawBody, sig, secret)`で署名検証（Firebase Functionsは`req.rawBody`を自動保持するため標準のNode版Stripe SDKがそのまま使える）。検証OK・支払い済み・（設定していれば）対象Price IDと一致する場合のみ、ランダムなライセンスキー（`MFPRO-XXXX-XXXX-XXXX`形式）を発行し、Firestoreの`licenses/{key}`と`sessions/{sessionId}`に書き込む。Webhook再送時の重複発行は`sessions`の既存チェックで防止。
  2. `issueLicense`：`pro-unlock.html`（決済直後のリダイレクト先）が`session_id`でポーリングしてキーを取得するための読み取り専用エンドポイント。
  3. `verifyLicense`：`index.html`の「ライセンスキーを入力」欄から呼ばれる検証エンドポイント。
  4. `firestore.rules`はクライアントからの直接読み書きを全面拒否（`allow read, write: if false`）。発行・検証は必ずAdmin SDK経由のCloud Functionsを通す設計にすることで、ブラウザから偽のライセンスをFirestoreに書き込めないようにしている。
  5. シークレットは`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`（`firebase-functions/params`の`defineSecret`、Secret Manager管理）。Price IDは秘匿情報ではないので`defineString('STRIPE_PRICE_ID')`（任意設定）。
- **Web側の解放UI**：`index.html`サイドバー「操作」直後に`#webProSection`を追加（`isPro()`を
  `window.MiseFitsNative.pro || hasWebLicense()`に拡張、`hasWebLicense()`は`localStorage`の
  `misefitsWebLicense`キーを見るだけ）。iOSアプリ内（`window.MiseFitsNative.isApp`）では非表示
  ＝アプリはApple IAP経由のため。`mobile/scripts/build-webapp-bundle.js`がアプリ版バンドル生成時に
  `MiseFitsNative`を`{isApp:true, pro:false, uid:null}`で同期初期化するステップを追加済み（チラつき防止）。
- **新規ページ**：`pro-unlock.html`（Payment Linkのリダイレクト先。`session_id`をクエリで受け取り
  `issueLicense`を1.5秒間隔・最大約10秒ポーリング。取得できたキーを表示＋コピー用ボタン。このページの
  URLを保存しておけば`session_id`から後日また同じキーを再確認できる＝メール送信の仕組みが無い代わりの
  簡易的な保険。メール送信でのバックアップ配布は将来の改善候補として保留）。
- **Firebaseプロジェクト作成済み（2026-08-26）**：プロジェクトID`misefits`（Blazeプラン・Firestore
  Standardエディション・nam5リージョン・本番モード＝全拒否ルールで作成済み。Google Analyticsは無効化）。
  `index.html`・`pro-unlock.html`双方の`FUNCTIONS_BASE`定数とCSPの`connect-src`は
  `https://us-central1-misefits.cloudfunctions.net`に設定済み。`.firebaserc`もこのプロジェクトIDを指す。
- **デプロイ済み（2026-08-28）**：Firestoreルール・Functions 3本（`stripeWebhook`/`issueLicense`/
  `verifyLicense`、Node.js 22・第2世代）を `firebase deploy` 済み。`firebase-functions`は7.x、
  `firebase-admin`は14.xに更新（デプロイ時にNode 20が非推奨警告を出したため22へ）。
- **Stripe（テストモード）設定済み（2026-08-28）**：商品「MiseFits Pro」¥1,480・一回限り、
  Price ID `price_1U9GsFKwklnRvDMqi4Yyqcmj`（`functions/.env`に記載）。Payment Link
  `https://buy.stripe.com/test_eVqbJ20pAbja08t2Mx0VO00`（決済後 `pro-unlock.html?session_id={CHECKOUT_SESSION_ID}`
  へリダイレクト設定済み）。Payment Link作成時に既定でONだった「Managed Payments」（取引あたり3.5%の
  追加手数料）と電話番号収集は**意図的にOFF**にした。`STRIPE_SECRET_KEY`はSecret Manager登録済み。

#### GCP環境構築でハマった点（同じ手順を再現する際の注意）

新規GCPプロジェクトでCloud Functions（第2世代）をデプロイする際、以下の4つが順に必要だった
（いずれも「デプロイは成功するのに動かない」形で現れるので、原因が分かりにくい）：

1. **Cloud Buildのサービスアカウント権限**：初回デプロイが「missing permission on the build service
   account」で失敗。Google公式の対処法どおり、デフォルトのCompute Engineサービスアカウント
   （`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`）に `roles/cloudbuild.builds.builder`
   を付与して解決（Cloud Buildのデフォルトサービスアカウント仕様変更に伴う既知の問題）。
2. **Compute Engine APIの有効化**：デプロイログに「Compute Engine API has not been used in project」
   の警告。第2世代Functionsはデフォルトのコンピュートサービスアカウントを参照するため有効化が必要。
3. **組織ポリシー「ドメインで制限された共有」の例外**：`kokokikaku.com` のGoogle Workspace組織には
   `constraints/iam.allowedPolicyMemberDomains` が適用されており、Cloud Runサービスへの `allUsers`
   付与（＝一般公開）がブロックされた。StripeのWebhookは外部からPOSTされ、`verifyLicense`はブラウザ
   から呼ばれるため**公開は設計上必須**。`misefits`プロジェクトのみポリシーを上書きして解決（組織全体の
   ポリシーは変更していない。他プロジェクトは保護されたまま）。この操作には組織レベルの
   `roles/orgpolicy.policyAdmin` が必要。
   - 公開しても安全な理由：Webhookは`stripe.webhooks.constructEvent`で署名検証済みのリクエストしか
     処理せず（署名なしのPOSTは400で拒否されることを実測確認済み）、`verifyLicense`はFirestore参照の
     真偽値を返すだけ。Firestoreはクライアント直アクセス全拒否。CORSも`misefits.kokokikaku.com`限定。
4. **実行サービスアカウントへのFirestore権限**：公開後、今度は500エラー（`Missing or insufficient
   permissions`）。新しいGCPプロジェクトではデフォルトのCompute SAに自動でEditor権限が付かなくなった
   ため、Functionsの実行SAがFirestoreを読み書きできない。同じSAに `roles/datastore.user`
   （Cloud Datastore ユーザー）を付与して解決。

**症状と原因の対応表**（デバッグの手がかり）：
| 症状 | 原因 |
|---|---|
| デプロイが「missing permission on the build service account」で失敗 | 上記1 |
| `cloudfunctions.net`のURLが404（Cloud Runにサービスが無い） | 上記1でビルドが失敗しており、関数のメタデータだけ残っている状態 |
| 403 Forbidden | 上記3（`allUsers`への公開がブロックされている） |
| 500 Internal Server Error | 上記4（実行SAにFirestore権限が無い） |

   - なお、Windows環境では `firebase` コマンドが `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`
     で異常終了することがあり、成功していても出力が途中で切れる。`functions:list` の結果と
     Cloud Runのサービス一覧を突き合わせて実際の状態を確認すること（`functions:list`は失敗した
     デプロイの残骸も表示してしまうため、Cloud Run側が正）。

- **Webhookエンドポイント作成済み（2026-08-28）**：`MiseFits Pro license issuer`
  （`we_1U9HzUKwklnRvDMqRRpALgN9`、テストモード）。宛先は
  `https://us-central1-misefits.cloudfunctions.net/stripeWebhook`、リッスン対象は
  `checkout.session.completed` の1件のみ。
- **稼働確認済み（2026-08-28）**：3エンドポイントとも期待どおりに応答することを実測。
  `verifyLicense?key=<無効なキー>` → `{"valid":false}` / 200、
  `issueLicense?session_id=<未知>` → `{"found":false}` / 404、
  `stripeWebhook`（署名なしPOST）→ 400で拒否、CORSは`misefits.kokokikaku.com`のみ許可。
- **通し確認完了（2026-08-28）**：テストカード`4242 4242 4242 4242`で実際に決済し、
  決済 → Webhook発火 → Firestoreへのキー発行 → `pro-unlock.html`へのリダイレクト＋キー表示 →
  本番`index.html`でのキー入力 → Pro解放（`isPro()`がtrue・localStorageに保存）まで
  **一気通貫で動作することを確認済み**。キーの大文字小文字は正規化され、1文字違いは正しく拒否される。
- **残作業**：本番モードへの切り替え。テストモードとは別に、(1) 本番の商品・Price ID作成、
  (2) 本番Payment Link作成（リダイレクト先は同じ`pro-unlock.html?session_id={CHECKOUT_SESSION_ID}`）、
  (3) 本番Webhookエンドポイント作成、(4) `functions/.env`のPrice IDを本番のものに差し替え、
  (5) `STRIPE_SECRET_KEY`（`sk_live_`）と`STRIPE_WEBHOOK_SECRET`を本番用に再設定して再デプロイ。
  ※Stripeはテストと本番で署名シークレットが別物なので、取り違えると全イベントが検証失敗する。
### Pro機能の実装状況

**方針転換（2026-08-28）**：当初計画では「無料版に透かしを入れ、Proで除去する」としていたが、
MiseFitsは公開以来ずっと透かし無しで出力できていたため、**それを後から制限するのは既存ユーザーに
とって明確な機能低下**になる。そこで **無料版は一切変更せず、Proは上乗せのみ** という方針に変更した。
透かし機能は実装しない。

- ✅ **高解像度出力（実装済み）**：無料は従来どおり `multiplier=2`。Proは `4` を目標に、端末の
  キャンバス上限に収まる範囲で0.5刻みに落として使う（`exportMultiplier()`）。上限を超えると出力が
  真っ白になるため。iOS/iPadOSは総画素の制限が厳しい（約16.7M=4096²）ので別枠にしている
  （`IS_IOS`。`IS_TOUCH`で判定すると**タッチ対応のWindowsノートまで低解像度に巻き込む**ため不可）。
  デスクトップ側の上限は50M画素と広めに取り、「従来2倍で出せていた図面はクランプされない」ようにしてある。
  実際に出た画素数は書き出し後のヒントに表示する（端末都合で4倍に届かないことがあるため、誇張しない）。
- ✅ **実寸スケール印刷（実装済み）**：出力パネルの「縮尺」セレクタ（`#exportScale`）。無料版は
  「自動フィット」固定でセレクタを無効化（`updateScaleNote()` が状態を反映）。Proでは 1:20〜1:200 を選べ、
  `buildPDF()` / `printLayout()` が `(px幅 × mmPerPixel) ÷ 縮尺` を**そのまま用紙上のmm**として配置する。
  - **未校正のシートでは使わせない**（`scaleBlockReason()`）。1px=何mmが確定していないと縮尺が嘘になるため。
  - **用紙に収まらない場合は出力を中止する**。収まらないまま出すと「1:50と書いてあるのに実寸でない」
    PDFができてしまうため、必要サイズと対処（用紙を大きくする／縮尺の数字を大きくする）を提示して止める。
  - PDFフッターには `Scale: 1:50 (true scale)` と明記する（自動フィット時は従来どおり `1px = N mm`）。
  - 印刷時はブラウザ既定の「用紙に合わせる」が縮尺を狂わせるため、**倍率100%にする案内を必ず出す**
    （ここはブラウザ側の設定なのでアプリからは強制できない、という限界がある）。
  - 検証済み：実寸8000×6000mmのシートで 1:100→用紙上80×60mm、1:200→40×30mm、
    自動フィット→従来どおり用紙いっぱい、をjsPDFへの実引数レベルで確認。
- ⬜ **未実装**：メモ・コメント機能／什器ライブラリ拡張／自由形状エディタ／PDF・画像トレース。
- **クライアント側ゲートの限界**：`isPro()` はブラウザ内の判定なので、その気になればローカルで
  書き換えられる。サーバ側で守っているのは「有効なライセンスキーの発行・検証」までで、機能の
  ロック自体は防壁ではない。買い切り¥1,480という価格帯では割に合う設計と判断している。
- この項目はiOSアプリのPhase 0〜4とは独立して進められる（Web版のみの変更で完結するため）。

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
