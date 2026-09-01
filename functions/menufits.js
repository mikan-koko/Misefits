const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

// ============================================================================
// MenuFits（menufits.kokokikaku.com）の買い切り「MenuFits Pro」¥1,480 の
// ライセンスAPI。MiseFits とは**完全に別売り**で、コレクションもキーの形式も
// Webhook も分けている。
//
// このファイルは index.js の MiseFits 用3関数には一切触れない。
// 稼働中で売上が立っている側を壊さないことを最優先にした構成。
// 相乗りしている理由（新規GCPプロジェクトを作らない）は
// menufits リポジトリの PRO-PLAN.md「5-2」を参照。
//
// initializeApp() は index.js 側で済んでいる。ここでは getFirestore() を
// 呼び出し時に取りに行く（読み込み順に依存しないようにするため）。
// ============================================================================

// **MiseFits とは別のシークレットにしている。** 理由は2つ。
// (1) 検証中は Stripe のサンドボックス（ライブとは別アカウント）を使うため、
//     ライブ用の sk_live_ では sandbox のセッションを読めない。
// (2) 片方の鍵を差し替えても、もう片方の販売を巻き込まない。
//     販売開始時はライブの sk_live_ を入れ直す（値は MiseFits と同じでも、枠は分けておく）。
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY_MENUFITS');
const menufitsWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET_MENUFITS'); // 署名シークレットは別物
const menufitsPriceId = defineString('STRIPE_PRICE_ID_MENUFITS', { default: '' });

// メール送信は MiseFits と同じSMTP設定を使う。ただし **差出人の表示名は差し替える**。
// MAIL_FROM は `MiseFits <studio@kokokikaku.com>` のように MiseFits 名義で入っているので、
// そのまま使うと MenuFits の購入者に「MiseFits」から届いてしまう。
// アドレスだけ取り出して MenuFits 名義に組み直す（シークレットは増やさない）。
const smtpHost = defineString('SMTP_HOST', { default: '' });
const smtpPort = defineString('SMTP_PORT', { default: '465' });
const smtpUser = defineSecret('SMTP_USER');
const mailFrom = defineSecret('MAIL_FROM');
const smtpPass = defineSecret('SMTP_PASS');

const ALLOWED_ORIGIN = 'https://menufits.kokokikaku.com';
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O/1/I/L 等の紛らわしい文字は除く
const KEY_PREFIX = 'MNPRO'; // MiseFits の MFPRO と紛らわしくしない
const LICENSES = 'menufitsLicenses';
const SESSIONS = 'menufitsSessions';
const MAX_DEVICES = 5;

const db = () => getFirestore();

function generateLicenseKey() {
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (const b of bytes) raw += KEY_ALPHABET[b % KEY_ALPHABET.length];
  const groups = raw.match(/.{1,4}/g).slice(0, 3);
  return KEY_PREFIX + '-' + groups.join('-');
}

function licenseMailBody(key) {
  return [
    'MenuFits Pro をご購入いただきありがとうございます。',
    '',
    '■ ライセンスキー',
    '    ' + key,
    '',
    '■ 解放のしかた',
    '  1. MenuFits を開く … https://menufits.kokokikaku.com/',
    '  2. 左パネルを下にスクロールして「MenuFits Pro」欄へ',
    '  3. 上のキーを貼り付けて「解放する」を押す',
    '',
    '同じキーで最大5台（ブラウザ単位）まで解放できます。',
    'このメールはキーの控えです。大切に保管してください。',
    '',
    '・料金とProガイド … https://menufits.kokokikaku.com/pro.html',
    '・よくある質問 … https://menufits.kokokikaku.com/faq.html',
    '・お問い合わせ … https://kokokikaku.com/',
    '',
    'MenuFits（提供：ここ企画）',
  ].join('\n');
}

// MAIL_FROM からメールアドレスだけを取り出し、MenuFits 名義に組み直す。
// `Name <addr@example.com>` でも `addr@example.com` でも動く。
function menufitsFrom(raw) {
  const m = String(raw || '').match(/<([^>]+)>/);
  const addr = (m ? m[1] : String(raw || '')).trim();
  return addr ? 'MenuFits <' + addr + '>' : raw;
}

// 送信できなくてもキーの発行自体は成功しているので、ここで例外を投げない。
// 結果は licenses ドキュメントに残して、問い合わせ時に追えるようにする。
async function sendLicenseMail(to, key) {
  const host = smtpHost.value();
  const user = smtpUser.value();
  const from = mailFrom.value();
  const pass = smtpPass.value();
  if (!to || !host || !user || !from || !pass) return { sent: false, reason: 'not configured' };

  const port = Number(smtpPort.value()) || 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 587 は STARTTLS なので secure:false
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: menufitsFrom(from),
    to,
    subject: 'MenuFits Pro ライセンスキーのご案内',
    text: licenseMailBody(key),
  });
  return { sent: true };
}

exports.menufitsStripeWebhook = onRequest(
  { secrets: [stripeSecretKey, menufitsWebhookSecret, smtpUser, mailFrom, smtpPass] },
  async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value());

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        menufitsWebhookSecret.value()
      );
    } catch (err) {
      res.status(400).send(`webhook signature verification failed: ${err.message}`);
      return;
    }

    if (event.type !== 'checkout.session.completed') {
      res.status(200).send('ignored (unhandled event type)');
      return;
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      res.status(200).send('ignored (not paid)');
      return;
    }

    // 同じStripeアカウントで MiseFits も売っているので、Price ID の一致は
    // 「念のため」ではなく**必須の切り分け**。設定されていなければ素通しになる点に注意。
    const priceId = menufitsPriceId.value();
    if (priceId) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      const matches = lineItems.data.some((li) => li.price && li.price.id === priceId);
      if (!matches) {
        res.status(200).send('ignored (unrelated price)');
        return;
      }
    }

    // Stripe は webhook を再送することがあるため、同一セッションへの重複発行を防ぐ
    const sessionRef = db().collection(SESSIONS).doc(session.id);
    const existing = await sessionRef.get();
    if (existing.exists) {
      res.status(200).send('already processed');
      return;
    }

    const key = generateLicenseKey();
    const email = session.customer_details?.email ?? null;
    await db().collection(LICENSES).doc(key).set({
      email,
      sessionId: session.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.set({
      licenseKey: key,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 控えメール。失敗しても webhook は成功扱いにする
    // （ここで500を返すと Stripe が再送し、上の重複ガードで二度と送れなくなる）。
    try {
      const result = await sendLicenseMail(email, key);
      await db().collection(LICENSES).doc(key).update(
        result.sent
          ? { mailSentAt: FieldValue.serverTimestamp() }
          : { mailSkipped: result.reason }
      );
    } catch (err) {
      console.error('menufits license mail failed', err);
      await db().collection(LICENSES).doc(key)
        .update({ mailError: String((err && err.message) || err) })
        .catch(() => {});
    }

    res.status(200).send('ok');
  }
);

// pro-unlock.html が session_id でキーを取りに来る読み取り専用エンドポイント
exports.menufitsIssueLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    res.status(400).json({ error: 'missing session_id' });
    return;
  }
  const doc = await db().collection(SESSIONS).doc(String(sessionId)).get();
  if (!doc.exists) {
    res.status(404).json({ found: false });
    return;
  }
  res.status(200).json({ found: true, key: doc.data().licenseKey });
});

// キー検証＋デバイス登録。device はクライアントが localStorage に持つランダムID。
// 未知のデバイスは空きがあれば devices 配列へ登録（＝1枠消費）、上限超過なら
// {valid:false, reason:'device_limit'}。device 無しの呼び出しは存在チェックのみで枠を消費しない。
exports.menufitsVerifyLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const key = String(req.query.key || '').trim().toUpperCase();
  const device = String(req.query.device || '').slice(0, 64);
  if (!key) {
    res.status(400).json({ valid: false });
    return;
  }
  const ref = db().collection(LICENSES).doc(key);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(200).json({ valid: false });
    return;
  }
  if (!device) {
    res.status(200).json({ valid: true });
    return;
  }
  const devices = Array.isArray(doc.data().devices) ? doc.data().devices : [];
  if (devices.includes(device)) {
    res.status(200).json({ valid: true });
    return;
  }
  if (devices.length >= MAX_DEVICES) {
    res.status(200).json({ valid: false, reason: 'device_limit' });
    return;
  }
  await ref.update({ devices: FieldValue.arrayUnion(device) });
  res.status(200).json({ valid: true });
});
