# AGENTS.md — 図面レイアウトシミュレーター

このリポジトリで作業するエージェント（Codex 等）向けの指示書です。まずこの1枚を読めば、開発・テスト・公開まで一通り分かるようにしています。詳細な設計は `HANDOFF.md` を参照してください。

## プロジェクト概要

図面（PDF/画像）を背景に、什器・設備を **実寸(mm) でドラッグ配置** できる、サーバー不要のブラウザ用ツール。飲食店等のレイアウト検討に使う。プロダクト名は **MiseFits**。
主な機能: 図面/白紙シート、縮尺キャリブレーション、什器ライブラリ、Undo/Redo、什器・壁への吸着ガイド、通路幅の計測、席数・面積の自動集計、PNG/PDF/印刷。

- 公開URL: https://misefits.kokokikaku.com/ （GitHub Pages custom domain, `main` / `/` ルート）
- 実体は **単一の `index.html`**（バニラJS）。ビルド工程・npm依存・フレームワークなし。
- 外部ライブラリは CDN(cdnjs) 読み込み：Fabric.js 5.3.1 / pdf.js 3.11.174 / jsPDF 2.5.1。→ **オンライン環境が必須**。

## いちばん大事なルール

1. **`index.html` を直接編集する。** これが唯一の本番ソース。ビルド生成物ではない。
2. **単一ファイル構成を維持する。** CSS も JS も `index.html` 内にインライン。CSS/JS を別ファイルに分割しない（明確な理由と合意がない限り）。
3. **ライブラリは CDN のまま。** バージョンを上げるときは後述の「テスト」で必ず回帰確認。
4. **`localStorage` は try/catch で包む**（すでにそうなっている）。自動保存に使用。artifact 環境等で例外になり得るため。
5. 破壊的・外部公開・課金を伴う操作（GitHubへのコミット、公開URLの変更など）は、勝手に実行せず利用者に確認する。

## リポジトリ構成

```
index.html   … 本番アプリ（公開版・単一ファイル）。ここを編集する。
guide.html   … 使い方ガイド（静的ページ。HowTo/FAQPage の構造化データ入り）。
privacy.html … プライバシーポリシー・免責事項（解析のオプトアウトUIを含む）。
404.html     … カスタム404（GitHub Pages が自動で使用）。
assets/      … ブランド画像（WebP/PNG）とOGP画像。
manifest.webmanifest / robots.txt / sitemap.xml / CNAME
README.md    … 利用者向けの使い方・公開手順。
AGENTS.md    … 本ファイル。
HANDOFF.md   … 詳細な設計・アーキテクチャ・変更履歴。
```

### アクセス解析（GA4）

`index.html` / `guide.html` / `privacy.html` / `404.html` の `<head>` に同じローダーが入っている。
`var GA_ID = '';` に測定ID（`G-XXXXXXXXXX`）を入れると有効になる。**4ファイルすべてを同じIDに揃えること。**
IDが空のあいだは外部への通信は一切発生しない。オプトアウト（localStorage の `misefitsAnalyticsOptOut`）と
Do Not Track を尊重する実装で、`privacy.html` に切り替えUIがある。CSPは既にGAのドメインを許可済み。

### 「サンプル入り版」について（重要・混同注意）
- 開発とは別に、内蔵サンプル図面（1〜3階の平面図PNGをbase64で埋め込んだ）版が存在するが、**それはクライアントの図面のため公開リポジトリには含めない**。
- 公開版 `index.html` の `SAMPLES` は `const SAMPLES = {};`（空）。什器ライブラリの「サンプル読込」ボタンや内蔵図面は公開版には無い。
- サンプル入り版は、この公開 `index.html` に対して「`SAMPLES` にbase64を注入」「空状態の文言差し替え」を施した派生物にすぎない。**開発では触らなくてよい。** 誤って 600KB 級のサンプル入りHTMLをこのリポジトリにコミットしないこと。

## ローカルでの動かし方

`index.html` をブラウザで開くだけ（CDNに繋がるオンライン環境で）。ビルド不要。
簡易サーバーを使うなら:

```bash
python3 -m http.server 8000   # → http://localhost:8000/index.html
```

## テスト（回帰確認）

自動テストは Playwright + Chromium。CDN がブロックされる環境向けに、ライブラリをローカル退避（vendor）して読み込むテスト用コピーを作って実行する。

```bash
# 1) ライブラリを vendor/ に取得（fabric 5.3.1 は npm に無いので 5.3.0-browser で代用）
mkdir -p vendor
npm pack fabric@5.3.0-browser && tar -xf fabric-5.3.0-browser.tgz && cp package/dist/fabric.min.js vendor/ && rm -rf package
npm pack pdfjs-dist@3.11.174 && tar -xf pdfjs-dist-3.11.174.tgz && cp package/build/pdf.min.js package/build/pdf.worker.min.js vendor/ && rm -rf package
npm pack jspdf@2.5.1 && tar -xf jspdf-2.5.1.tgz && cp package/dist/jspdf.umd.min.js vendor/ && rm -rf package

# 2) CDN参照を vendor/ に差し替えたテスト用コピーを生成
sed -e 's#https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js#vendor/fabric.min.js#' \
    -e 's#https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js#vendor/pdf.min.js#' \
    -e 's#https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js#vendor/pdf.worker.min.js#' \
    -e 's#https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js#vendor/jspdf.umd.min.js#' \
    index.html > index.test.html
```

Playwright スクリプト例（`page.on('pageerror')` を必ず監視して JS エラー0を確認）:

```js
const { chromium, devices } = require('playwright');
(async () => {
  const errs = [];
  const b = await chromium.launch(); // 環境により executablePath を指定
  const ctx = await b.newContext({ ...devices['iPhone 12'], hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.message().includes('復元') ? d.dismiss() : d.accept()); // 復元確認は閉じる
  await p.goto('file://' + process.cwd() + '/index.test.html');
  // …画像/PDFアップロード→縮尺設定→什器追加→回転→出力 を操作して検証…
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
```

手動チェックの最低ライン（毎回確認）:
- PDF/画像アップロード → 背景表示（pdf.js は1ページ目を scale:2.0 でレンダリング）
- 縮尺設定（2点クリック→mm入力）で `mmPerPixel` が更新される
- 什器を追加 → タップで寸法バッジ表示、実寸が正しい（例: 4人テーブルが 1200×700 と出る）
- Undo/Redo（Ctrl+Z / Ctrl+Shift+Z、アクションバーの ↶ ↷）が1操作ずつ効く
- 什器を他の什器の近くへ動かすとピンクのガイドが出て辺が揃う
- 計測（📐 / Mキー）で2点をクリックすると mm が出る（600未満=赤 / 900未満=橙 / 以上=緑）。Escで解除
- サイドバーの「集計」に席数・パーツ数・面積・占有率が出る
- 回転（スライダー/±ボタン/Rキー）
- PNG / PDF 出力 と 印刷（グリッドは出力されない）
- スマホ幅（≤860px）で ☰ ドロワー、右上ズームバー、コンパクトなプロパティパネル、移動モード（ハンドル無しでドラッグ＝移動）、下部クイックパーツバー、1行フッター
- 計測モード中に線をクリックすると1本だけ消える／「最後の1本を取消」「すべてクリア」が効く
- サイドバー「操作」の「すべて削除」で配置が消え、Ctrl+Z で戻る
- `guide.html` / `privacy.html` / `404.html` が開き、フッターの相互リンクが繋がっている
- ブラウザコンソールに JS エラーが出ていない

## 公開（デプロイ）

GitHub Pages（`main` ブランチ / ルート）。`index.html` と `CNAME` を更新して `main` に push/commit すれば約1分で反映。
カスタムドメインは `misefits.kokokikaku.com`。DNS側では `misefits` の CNAME を `mikan-koko.github.io` に向ける。
Web UI からのアップロードで更新する場合: リポジトリの `Upload files` で `index.html` を上書きコミット → Pages が自動再ビルド。反映確認はキャッシュ回避で `?v=N` を付けて開く。

## 数値・単位の約束

- 実寸は「線幅を含まない基準ジオメトリ `data.baseW/baseH`（px）× オブジェクトの `scaleX/Y` × シートの `mmPerPixel`」で算出（`objRealSize()`）。線幅ぶんの誤差を出さないため。
- サンプル図面の `mmPerPixel = 6.35`（100dpiレンダリング, 縮尺1:25 → `25.4/100*25`）。アップロード図面は既定 6.35 の未校正状態で、ユーザーが縮尺設定で確定する。

## よくある落とし穴

- **Fabric 5.3.1 は npm に無い**（cdnjs 固有ビルド）。ローカルテストは 5.3.0-browser で代用。本番の CDN は 5.3.1 のままでよい。
- **jsPDF 標準フォントは日本語非対応。** PDF内に日本語テキストを直接描くと文字化けする。図面画像はラスタなので問題ないが、追記するテキスト（フッター等）はASCIIに限定している。
- **モバイルのタッチ操作**：ピンチズームは `upperCanvasEl` の capture フェーズ touch イベントで処理し、2本指時に Fabric へ伝播させない。1本指は空所ドラッグでパン、什器上ドラッグで移動。タッチ既定は「移動モード」（`handleMode=false`, `hasControls=false`）で誤リサイズを防止。
- **画面の高さは `100dvh`**（モバイルのブラウザUIでの見切れ対策）。ズームバーはモバイルでは右上。

## 今後の拡張候補（未実装）

- 実寸スケール印刷（1:50 等、用紙サイズに合わせた厳密出力）
- 計測線をレイアウトの一部として保存・出力できるようにする（現在はオーバーレイのみ）
- 什器メーカーの CAD/SVG 取り込み、ログイン＆サーバ保存
