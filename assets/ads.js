/* MiseFits 広告スロット（A8.net / もしもアフィリエイト 兼用）
 *
 * ASPのタグを貼るまでは AD_TAGS が空なので、広告枠は DOM ごと消える
 * （外部への通信もラベル表示も一切発生しない）。残りの作業は2つだけ。
 *
 *  1. 下の AD_TAGS に、ASPの管理画面からコピーしたタグをそのまま貼る。
 *  2. 実際に広告が出ているページで DevTools の Console に
 *     CSP 違反が出ていないことを確認する。
 *
 * CSP は A8.net 向け（img-src https://*.a8.net）を掲載8ページに追記済み。
 * もしもアフィリエイトの「かんたんリンク」を使う場合は、JS で商品画像を差し込むため
 * 追加で script-src https://af.moshimo.com と
 * img-src https://image.moshimo.com https://i.moshimo.com https://m.media-amazon.com
 *         https://thumbnail.image.rakuten.co.jp が必要になる。
 *
 * 掲載面のルール（AGENTS.md にも記載）:
 *   - 出すのは集客ページ（madori-2d / layout-* / aisle-width / fixture-sizes / guide / faq）だけ。
 *     アプリ本体（/）と課金導線（pro.html / pro-unlock.html）には出さない。
 *   - Proライセンスを持っている人には出さない（下の isProUser）。
 *   - 「広告」ラベルを必ず併記する（景品表示法のステマ規制対応、およびA8の広告表示義務）。
 *     ラベルはこのファイルが自動で付けるので、ページ側に書く必要はない。
 */
(function(){
  'use strict';

  /* ===== ここにASPのタグを貼る（貼るまでは広告枠は出ない） =====
     キーは「どの広告主か」。A8の広告リンク生成で、掲載サイトに MiseFits を
     選んでから出力したタグを、そのまま文字列として貼ること。 */
  var AD_TAGS = {
    /* 家具350（株式会社イーナ）… 住まい寄りの madori-2d 用。素材ID 025（テキスト）。
       A8が生成したタグそのまま。rel や URL を書き換えるとA8の規約違反になるので触らない。 */
    'kagu350':
      '<a href="https://px.a8.net/svt/ejp?a8mat=4BA2HE+6QBFZM+20EY+C2102" rel="nofollow">家具350</a>'
      + '<img border="0" width="1" height="1" src="https://www19.a8.net/0.gif?a8mat=4BA2HE+6QBFZM+20EY+C2102" alt="">',
    /* オフィスコム（オフィス家具通販）… 店舗・オフィス什器の文脈が近い集客ページ用。素材ID 001（テキスト）。 */
    'officecom':
      '<a href="https://px.a8.net/svt/ejp?a8mat=4BC36L+FUYT02+53JI+BWVTE" rel="nofollow">机や椅子などのオフィス家具通販【オフィスコム】</a>'
      + '<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BC36L+FUYT02+53JI+BWVTE" alt="">'
  };

  /* どのページのどの枠に、どの広告主を出すか。
     キーはページのファイル名、'default' は指定のないページ。
     ページ側は <div data-ad="article-bottom"></div> のままでよく、
     出し分けはここだけで変えられる。 */
  var SLOTS = {
    'article-bottom': {
      'madori-2d.html': 'kagu350',
      'default': 'officecom'
    }
  };

  function pageKey(){
    try{
      var last = location.pathname.split('/').pop();
      return last || 'index.html';
    }catch(e){ return 'index.html'; }
  }

  /* 枠名 → 実際に差し込むタグHTML（該当なしなら空文字） */
  function tagForSlot(slot){
    var plan = SLOTS[slot];
    if(!plan) return '';
    var key = plan[pageKey()] || plan['default'];
    return (key && AD_TAGS[key]) || '';
  }

  /* 広告を出すときだけ privacy.html に差し込む説明文。
     タグが空のあいだは「広告は出していない」が事実なので、何も表示しない。 */
  var AD_DISCLOSURE =
    '<p>本サイトの一部のページには、アフィリエイトプログラム（A8.net／株式会社ファンコミュニケーションズ）による'
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
      var html = tagForSlot(el.getAttribute('data-ad'));
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
