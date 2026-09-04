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
index.html      … 本番アプリ（公開版・単一ファイル）。ここを編集する。
guide.html      … 使い方ガイド（静的ページ。HowTo/FAQPage の構造化データ入り）。
                  末尾の「業種別・寸法別のガイド」から下記の集客ページへ送っている。
layout-restaurant.html … 業種別ガイド：飲食店・カフェ。
layout-salon.html      … 業種別ガイド：美容室・サロン。
layout-classroom.html  … 業種別ガイド：学習塾・教室・オフィス。
aisle-width.html       … 寸法ガイド：通路幅と什器のすき間。
madori-2d.html         … 集客ページ：2Dの間取りシミュレーション（幅×奥行きだけで検討する層向け）。
fixture-sizes.html     … 什器・設備の寸法一覧（LIBRARY から自動生成。手で数値を書かない）。
privacy.html    … プライバシーポリシー・免責事項（解析のオプトアウトUIを含む）。
pro-unlock.html … 買い切りStripe決済後のリダイレクト先（ライセンスキー表示）。
404.html        … カスタム404（GitHub Pages が自動で使用）。
assets/         … ブランド画像（WebP/PNG）とOGP画像。
assets/ads.js   … アフィリエイト広告枠（もしも/A8兼用）。タグ未設定のあいだは枠ごと消える。
manifest.webmanifest / robots.txt / sitemap.xml / CNAME
README.md       … 利用者向けの使い方・公開手順。
AGENTS.md       … 本ファイル。
HANDOFF.md      … 詳細な設計・アーキテクチャ・変更履歴。
mobile/         … 【凍結】iOSアプリ（Expo + WebView）。2026-08-28にリリース中止を決定、コードは参考として残置。
functions/      … Firebase Cloud Functions（Web版買い切りのライセンスAPI）。
firebase.json / firestore.rules / firestore.indexes.json … 上記Functionsのプロジェクト設定。
```

### `mobile/`（iOSアプリ）について

- **【重要】2026-08-28、iOSアプリはリリースしないことが決定した（Web版のみで展開する）。**
  `mobile/` 以下と `index.html` のネイティブブリッジ（`window.MiseFitsNative`）は無害なので残しているが、
  今後の開発はWeb版のみを対象とする。RevenueCat/Apple IAPの実装は不要。
- iOS App Store向けに、`index.html` を **フォークせず** Expo/React Native の `WebView` でラップしたもの。
- `index.html` はこれまで通り唯一の本番ソース。`mobile/scripts/build-webapp-bundle.js` がCDN依存の
  ローカル同梱・CSP調整だけを行った派生HTMLを自動生成する（ロジックはWeb版と完全に共有）。
- `index.html` に手を入れたら `mobile/` 側で `npm run build:webapp` を実行して同梱HTMLを再生成すること。
- 課金（RevenueCat）・Pro限定機能は未実装。**クラウド保存（サブスク）は2026-08-31に提供取りやめを決定**
  （経緯は HANDOFF.md の「課金設計」の決定ブロックを参照）。

### `functions/`（Web版の買い切り販売）について

- Web版（`misefits.kokokikaku.com`）で「MiseFits Pro」買い切り（¥1,480）をStripeで直接販売するための
  Firebase Cloud Functions。iOSアプリのRevenueCat/Apple IAPとは完全に別売り（意図的な設計、統合しない）。
- `index.html`・`pro-unlock.html` はこのFunctionsのURLを`FUNCTIONS_BASE`定数とCSPの`connect-src`に
  ハードコードしている：`https://us-central1-misefits.cloudfunctions.net`（Firebaseプロジェクト
  `misefits`、2026-08-26作成・Blazeプラン・Firestore作成済み）。詳細は HANDOFF.md「Web版での買い切り販売」を参照。
- **ライセンスキーの控えメール**：`stripeWebhook` がキー発行後に `sendLicenseMail()` で購入者へ送る。
  設定は `functions/.env`（`SMTP_HOST` / `SMTP_PORT` のみ）＋ Secret Manager の
  `SMTP_USER` / `MAIL_FROM` / `SMTP_PASS`。**このリポジトリは公開なので、メールアドレスを `.env` に
  書かないこと**（差出人アドレスもSecret側に置いている理由）。**どれかが空のあいだは送信をスキップする**ので、
  未設定でもキー発行は通常どおり動く。送信失敗でwebhookを落とすとStripeが再送し、
  `sessions/{id}` の重複ガードで二度と送れなくなるため、**メールの例外は握りつぶして200を返す**設計。
  結果は `licenses/{key}` の `mailSentAt` / `mailSkipped` / `mailError` に残るので問い合わせ時に追える。
  設定手順：

  ```bash
  # functions/.env はリポジトリに存在する（STRIPE_PRICE_ID が入っている）。上書きせず追記すること。
  firebase functions:secrets:set SMTP_USER   # 例: studio@kokokikaku.com
  firebase functions:secrets:set MAIL_FROM   # 例: MiseFits <studio@kokokikaku.com>
  firebase functions:secrets:set SMTP_PASS   # Googleアプリパスワード
  firebase deploy --only functions
  ```

### アクセス解析（GA4）

公開している全HTML（`index.html` / `guide.html` / `pro.html` / `pro-unlock.html` / `faq.html` /
`releases.html` / `privacy.html` / `tokushoho.html` / `404.html`）の `<head>` に同じローダーが入っている。
`var GA_ID = '';` に測定ID（`G-XXXXXXXXXX`）を入れると有効になる。**全ファイルを同じIDに揃えること。**
IDが空のあいだは外部への通信は一切発生しない。オプトアウト（localStorage の `misefitsAnalyticsOptOut`）と
Do Not Track を尊重する実装で、`privacy.html` に切り替えUIがある。CSPは既にGAのドメインを許可済み。

#### 集客ページ（業種別ガイド・寸法ガイド）

`layout-*.html` / `aisle-width.html` / `madori-2d.html` は、検索から入ってきた人を `/` へ送るための入口。
アプリ本体（`/`）は索引対象のテキストが少ないので、**検索の受け皿はこちら側で作る**という分担。

**狙っている検索意図は2系統ある。混ぜないこと。**

| 系統 | 受け皿 | 主なワード |
|---|---|---|
| 店舗・施設をつくる人 | `layout-*` / `aisle-width` / `fixture-sizes` | 店舗レイアウト、通路幅、什器 寸法 |
| 部屋の配置を考えたい人 | `madori-2d.html` | 間取り シミュレーション、2D 間取り、家具配置、幅 奥行き |

`madori-2d.html` は「3Dも図面ソフトも要らない」を軸に、**畳数→mmの換算**と**家具の実寸**で受ける。
トップ（`/`）の `title` / `description` / JSON-LD にも2D・間取り・無料・登録不要を入れてあるが、
**店舗レイアウトの看板は外さない**（既存の順位を落とさないため、トップは両取りの位置づけ）。

- **構成は4ページとも共通**：ヒーロー → 目次 → 考え方 → 什器の寸法表 → MiseFitsでの手順 →
  つまずきやすいところ → FAQ → 関連ページ → CTA。構造化データは `Article` + `FAQPage` + `BreadcrumbList`。
- **寸法は必ず `index.html` の `LIBRARY` の実データから引く。** 数字を創作しない。
  什器を足したり寸法を変えたら、該当ページの表も直すこと。
  `fixture-sizes.html` は **`LIBRARY` から機械的に生成した全138点の一覧**で、他社が持っていない
  独自データがそのまま資産になる。什器を増減したらこのページを作り直すこと（手編集しない）。
  カテゴリごとの解説文だけは人が書いている。
- **法令の断定を書かない。** 通路幅・避難経路・保健所の基準は業態と物件で変わる。
  「目安」「検討の出発点」と明示し、最終判断は建築士・施工会社・所轄の窓口へ、と必ず添える
  （各ページのフッター `legalnote` に共通の免責を置いてある）。
- ページを増やすときは、**`guide.html` の `#bytype` にカードを追加し、`sitemap.xml` にも登録する。**
  既存ページの「関連ページ」ブロックにも相互リンクを足す。
- 中身の薄い業種ページを量産しない。1ページあたり本文2,500〜3,500字程度（空白除く）を目安に、
  その業種でしか書けないこと（決める順番・つまずき方）を必ず入れる。

#### アフィリエイト広告（assets/ads.js）

**2026-09-04時点では未稼働。** `assets/ads.js` の `AD_TAGS` が空なので、広告枠は DOM ごと削除され、
外部への通信もラベル表示も発生しない。ASP（もしもアフィリエイト／A8.net）を決めたら次の3つを行う。

1. `AD_TAGS['article-bottom']` に、ASPの管理画面からコピーしたタグをそのまま貼る。
2. そのタグが読む外部ドメインを、**掲載している全ページの CSP に追記する**
   （A8は `img-src` だけで足りる／もしものかんたんリンクは `script-src` も要る。詳細は `ads.js` 冒頭のコメント）。
3. 実際に広告が出ているページで、DevTools の Console に CSP 違反が出ていないことを確認する。

**掲載のルール。**

- 出すのは**集客ページだけ**（`layout-*` / `aisle-width` / `fixture-sizes` / `madori-2d` / `guide` / `faq`）。
  **アプリ本体（`/`）と課金導線（`pro.html` / `pro-unlock.html`）には出さない。**
  ツールの信頼と ¥1,480 の買い切りの価値を下げないため。
- **Proライセンスを持っている人には出さない。** 判定は `index.html` の `isPro()` と同じで、
  `window.MiseFitsNative.pro` と localStorage の `misefitsWebLicense` を見る。
- **「広告」ラベルを必ず併記する**（景品表示法のステマ規制対応）。`ads.js` が自動で付けるので、
  ページ側に書く必要はない。逆に、`ads.js` を通さずに素のタグを直書きしないこと。
- `privacy.html` の「3. 外部サービスの利用」に `<div data-ad-disclosure></div>` を置いてある。
  タグを設定した瞬間に説明文が入り、外すと消える。**掲載状況と記載が自動で一致する**ので、
  ここを手で書き換えないこと。
- 枠を増やすときは `AD_TAGS` にキーを足し、ページ側に `<div data-ad="<キー>"></div>` を置く。

#### 課金導線（Pro）の作り

- **ロック機能に当たったら、決済ページへ直行させない。** `requestProPurchase(feature)` は
  購入前モーダル（`#proModalBackdrop`）を開く。触った機能名・¥1,480・買い切りである点・解放される
  6機能を見せてから `proceedToProPurchase()` でStripeへ送る。iOSアプリ内（`ReactNativeWebView`）は
  従来どおりApple IAPへのpostMessageで、モーダルは出さない。
- Pro機能を増やしたら、**ロック地点から `requestProPurchase('<feature名>')` を呼び、
  モーダルの `#proModalList` に `data-f="<feature名>"` の行を足す**（触った行が太字になる）。
  `PRO_FEATURE_LABELS` にも表示名を足すとモーダル冒頭の文が具体的になる。
- 決済リンク `PRO_PURCHASE_URL` は `index.html` と `pro.html`（購入ボタン3か所のhref）に
  ハードコードされている。**変更時は両方そろえること。**
- `pro.html` は検索・SNSからの着地点でもあるので、**必ずそのページ単体で購入まで完結できる状態を保つ**
  （ヒーロー・購入の流れ・最下部の3か所に購入ボタン）。

#### 課金ファネルのイベント

`index.html` / `pro.html` / `pro-unlock.html` はローダー直後に `trackEvent(name, params)` を定義している。
解析が無効（ID未設定・オプトアウト・DNT）なら何もしない安全なラッパーなので、計測を足すときはこれを使う。
現在送っているイベントは次の5つ。**GA4の管理画面側でキーイベント（コンバージョン）に指定するのは `purchase`。**

| イベント | 送る場所 | 主なパラメータ |
|---|---|---|
| `pro_lock_hit` | `requestProPurchase()`（Pro機能に当たった瞬間） | `feature`（`free_shape` / `area_trace` / `memo_add` / `memo_edit` / `export_scale` / `fixture:<key>` / `sidebar`） |
| `pro_buy_click` | 決済リンクを開く直前 | `feature`, `location`（`app_modal` / `hero` / `step1` / `footer`） |
| `pro_detail_click` | 購入モーダルの「詳しく見る」 | `feature` |
| `license_unlock_success` / `license_unlock_fail` | キー検証の成否（アプリのサイドバーと購入完了ページ） | `location`（`app` / `pro_unlock`）, `reason`（`invalid` / `device_limit` / `network`） |
| `purchase` | `pro-unlock.html` でキーを表示できたとき | `transaction_id`（Stripeのsession_id）, `value:1480`, `currency:'JPY'`, `items` |

`pro_lock_hit` と `pro_buy_click` の差が「モーダルまで来たが買わなかった数」になる。
`feature` を見ればどのPro機能が購入意欲を生んでいるかが分かるので、機能追加時は必ず `feature` を渡すこと。

`purchase` はリロードでの二重計上を防ぐため、`localStorage` の `misefitsPurchaseTracked:<session_id>` で
1回だけ送るようにしている。

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
- 「白紙から」で形状選択モーダルが開き、矩形/L字/コの字を選んで作成できる。L字/コの字は面積が欠けの分だけ正しく減る（集計パネルで確認）
- `guide.html` / `privacy.html` / `404.html` が開き、フッターの相互リンクが繋がっている
- ブラウザコンソールに JS エラーが出ていない

## 公開（デプロイ）

GitHub Pages（`main` ブランチ / ルート）。`index.html` と `CNAME` を更新して `main` に push/commit すれば約1分で反映。
カスタムドメインは `misefits.kokokikaku.com`。DNS側では `misefits` の CNAME を `studio8080.github.io` に向ける。
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
