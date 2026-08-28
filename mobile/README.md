# MiseFits iOSアプリ（Expo / WebViewラッパー）

ルートの `../index.html`（MiseFits Web版・単一ソース）を書き換えずに、Expo (React Native) の
`WebView` でラップしてiOSアプリ化するプロジェクト。詳しい経緯・全体ロードマップは
リポジトリ直下の `AGENTS.md` / `HANDOFF.md` を参照。

## 仕組み

- **ロジックの本体はすべて `../index.html` 側にある。** Web版とアプリ版は同じソースを共有する。
- `../index.html` には `window.MiseFitsNative` / `isPro()` / `handleNativeMessage()` という
  ネイティブ連携用のフックがすでに入っている（Pro機能のフラグ受信の仕組み。詳細はindex.html内の
  「ネイティブアプリ連携（Pro機能）」セクションのコメント参照）。
- `scripts/build-webapp-bundle.js` が `../index.html` を読み込み、
  1. cdnjs依存（Fabric.js/pdf.js/jsPDF）をダウンロードして `assets/webapp/vendor/*.bin` に保存
     （`.bin` 拡張子はMetroに「同梱アセット」として扱わせるためのもの。中身は普通のJS）
  2. `<script>` タグ・pdf.workerパスをローカル参照に書き換え
  3. CSPメタタグを削除（WebViewのfile://コンテキストでは不要）
  4. `GA_ID` を空にしてアプリ版では解析を無効化（ATT判定リスク回避）

  した `assets/webapp/index.html` を生成する。**このファイルとvendor/以下は生成物だが、
  Metroの `require()` はビルド時に静的パスを要求するためリポジトリにコミットする。**
  `../index.html` を編集したら `npm run build:webapp` で再生成すること（`npm install` 時にも
  `postinstall` で自動実行される）。
- `App.tsx` が起動時に `assets/webapp/` の同梱ファイルを `expo-file-system` でキャッシュ
  ディレクトリに実ファイルとして展開し（`vendor/fabric.min.js` 等、相対パス構造を維持）、
  `WebView` でその `index.html` を読み込む。
- Web↔Native間は `postMessage`（Web→Native）と `injectJavaScript` 経由で `window.handleNativeMessage()`
  を直接呼び出す方式（Native→Web）でJSONメッセージをやり取りする。

## セットアップ

```bash
cd mobile
npm install          # postinstallでassets/webapp/を自動生成
```

`../index.html` を変更した後は:

```bash
npm run build:webapp          # 差分だけ反映（vendorライブラリは既存ならダウンロードし直さない）
npm run build:webapp:force    # vendorライブラリも含めて全部作り直す
```

## 実行（要Mac/Xcode）

`react-native-webview` はネイティブモジュールのため **Expo Goでは動作しない可能性がある**
（未検証。もし動かない場合はdevelopment buildが必要）。

```bash
npx expo run:ios     # ローカルビルド（Xcode必須）
# または
eas build --profile development --platform ios   # EAS経由（Phase 2でRevenueCat等を足す前提ならこちらが前提）
```

## 現状（Phase 1時点）でできること・できないこと

- ✅ Web版の全機能（PDF/画像アップロード・什器配置・保存・PNG/PDF書き出し等）がそのままアプリ内WebViewで動く想定
- ✅ ネイティブ→Web のPro状態通知の配線（`sendEntitlement()` は現状常に `pro:false` を送るダミー実装）
- ❌ 実際の課金（RevenueCat）は未接続 — `requestPurchase` メッセージを受けてもコンソールログのみ（Phase 2）
- ❌ クラウド保存（Firebase）は未接続（Phase 3）
- ❌ Pro限定の新機能（自由形状エディタ／トレース・透かし無し出力）は未実装（Phase 3）
- ⚠️ **この開発環境（Windows・macOS/Xcode無し）ではiOSシミュレータでの実機動作確認ができていない。**
  TypeScriptの型チェック・`expo-doctor`・Metroバンドル（`expo export --platform ios`）は
  すべて成功しているが、実際にWebView内でファイルアップロードや什器配置が動くかはMac側での
  `npx expo run:ios` 実行で確認すること。
