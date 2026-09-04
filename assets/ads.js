/* MiseFits 広告スロット（もしもアフィリエイト / A8.net 兼用）
 *
 * 使い方は3ステップ。ASPを決めていないあいだは AD_TAGS が空なので、
 * 広告枠は DOM ごと消える（外部への通信もラベル表示も一切発生しない）。
 *
 *  1. 下の AD_TAGS に、ASPの管理画面からコピーしたタグをそのまま貼る。
 *  2. 貼ったタグが読む外部ドメインを、掲載ページの CSP に追記する（下の表を参照）。
 *  3. 反映後、実際に広告が出ているページで DevTools の Console に
 *     CSP 違反が出ていないことを確認する。
 *
 * CSP に足す必要があるドメイン（ASPごと）:
 *   A8.net          img-src  https://www2*.a8.net https://www.a8.net https://px.a8.net
 *                            ※バナーは <a>+<img> だけなので img-src の追記で足りる
 *   もしもアフィリエイト  script-src https://af.moshimo.com
 *                            img-src  https://image.moshimo.com https://i.moshimo.com
 *                                     https://m.media-amazon.com https://thumbnail.image.rakuten.co.jp
 *                            ※「かんたんリンク」は JS で商品画像を差し込むので許可範囲が広くなる
 *
 * 掲載面のルール（AGENTS.md にも記載）:
 *   - 出すのは集客ページ（layout-* / aisle-width / fixture-sizes / guide / faq）だけ。
 *     アプリ本体（/）と課金導線（pro.html / pro-unlock.html）には出さない。
 *   - Proライセンスを持っている人には出さない（下の isProUser）。
 *   - 「広告」ラベルを必ず併記する（景品表示法のステマ規制対応）。ラベルはこのファイルが自動で付ける。
 */
(function(){
  'use strict';

  /* ===== ここにASPのタグを貼る（貼るまでは広告枠は出ない） ===== */
  var AD_TAGS = {
    /* 記事末尾（関連ページの手前）。全集客ページ共通。 */
    'article-bottom': ''
  };

  /* 広告を出すときだけ privacy.html に差し込む説明文。
     タグが空のあいだは「広告は出していない」が事実なので、何も表示しない。 */
  var AD_DISCLOSURE =
    '<p>本サイトの一部のページには、アフィリエイトプログラム（もしもアフィリエイト／A8.net）による'
    + '広告を掲載しています。広告の表示や広告経由での遷移にあたり、広告配信事業者がCookie等を用いて'
    + '閲覧情報を取得する場合があります。取得される情報の範囲と利用目的は、各広告配信事業者の'
    + 'プライバシーポリシーに従います。<strong>読み込んだ図面やレイアウトの内容が広告配信事業者へ'
    + '送信されることはありません。</strong>また、MiseFits Pro のライセンスを認証済みの端末では、'
    + '広告は表示されません。</p>';

  /* Proを持っている人には出さない。
     - iOSアプリ内は window.MiseFitsNative.pro
     - Webは pro-unlock.html / アプリ本体でキー認証したときの localStorage キー
     どちらも index.html の isPro() と同じ判定に揃えてある。 */
  function isProUser(){
    try{ if(window.MiseFitsNative && window.MiseFitsNative.pro) return true; }catch(e){}
    try{ if(localStorage.getItem('misefitsWebLicense')) return true; }catch(e){}
    return false;
  }

  function hasAnyTag(){
    for(var k in AD_TAGS){ if(AD_TAGS[k]) return true; }
    return false;
  }

  function injectStyle(){
    if(document.getElementById('adSlotStyle')) return;
    var s = document.createElement('style');
    s.id = 'adSlotStyle';
    s.textContent =
      '.ad-slot{margin:26px auto 0;max-width:900px;background:#fff;border:1px solid var(--line,#dfe4ec);'
      + 'border-radius:16px;padding:14px 16px 16px;box-shadow:0 6px 18px rgba(25,33,46,.05);}'
      + '.ad-slot__label{display:inline-block;font-size:10.5px;font-weight:900;letter-spacing:.08em;'
      + 'color:#7a8494;background:#f4f7fb;border:1px solid var(--line,#dfe4ec);border-radius:5px;'
      + 'padding:1px 7px;margin-bottom:10px;}'
      + '.ad-slot__body{font-size:13px;line-height:1.7;overflow-x:auto;}'
      + '.ad-slot__body img{max-width:100%;height:auto;}';
    document.head.appendChild(s);
  }

  function drop(el){ if(el && el.parentNode) el.parentNode.removeChild(el); }

  function run(){
    var slots = document.querySelectorAll('[data-ad]');
    var disclosure = document.querySelector('[data-ad-disclosure]');
    var pro = isProUser();
    var live = hasAnyTag() && !pro;

    if(live) injectStyle();

    for(var i = slots.length - 1; i >= 0; i--){
      var el = slots[i];
      var html = AD_TAGS[el.getAttribute('data-ad')] || '';
      if(!live || !html){ drop(el); continue; }
      el.className = (el.className ? el.className + ' ' : '') + 'ad-slot';
      var label = document.createElement('span');
      label.className = 'ad-slot__label';
      label.textContent = '広告';
      var body = document.createElement('div');
      body.className = 'ad-slot__body';
      body.innerHTML = html;
      el.appendChild(label);
      el.appendChild(body);
    }

    if(disclosure){
      /* プライバシーポリシーの記載は「実際に広告を出しているか」に合わせる。
         Pro判定では消さない（掲載している事実は変わらないため）。 */
      if(hasAnyTag()) disclosure.innerHTML = AD_DISCLOSURE;
      else drop(disclosure);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
