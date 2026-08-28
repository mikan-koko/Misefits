const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');

// Web版の買い切り「MiseFits Pro」（¥1,480）のライセンスキー発行・検証API。
// Firestoreへの書き込みは stripeWebhook（Stripeの署名検証を通過した場合のみ）からしか行わない設計。
// issueLicense / verifyLicense は読み取り専用で、クライアントから直接Firestoreを触らせない
// （firestore.rulesで全面拒否。Admin SDK経由のここだけがルールをバイパスして読み書きできる）。

initializeApp();
const db = getFirestore();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
// Price IDは秘匿情報ではないので通常のパラメータとして扱う（誤発行防止用・任意）
const stripePriceId = defineString('STRIPE_PRICE_ID', { default: '' });

const ALLOWED_ORIGIN = 'https://misefits.kokokikaku.com';
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O/1/I/L等の紛らわしい文字を除いたbase32相当

function generateLicenseKey() {
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (const b of bytes) raw += KEY_ALPHABET[b % KEY_ALPHABET.length];
  const groups = raw.match(/.{1,4}/g).slice(0, 4);
  return 'MFPRO-' + groups.join('-');
}

exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value());

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        stripeWebhookSecret.value()
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

    // 対象Price IDのみ処理（将来Web版で他の商品を売るようになった場合の誤発行防止）
    const priceId = stripePriceId.value();
    if (priceId) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      const matches = lineItems.data.some((li) => li.price && li.price.id === priceId);
      if (!matches) {
        res.status(200).send('ignored (unrelated price)');
        return;
      }
    }

    // Stripeはwebhookを再送することがあるため、同一セッションへの重複発行を防ぐ
    const sessionRef = db.collection('sessions').doc(session.id);
    const existing = await sessionRef.get();
    if (existing.exists) {
      res.status(200).send('already processed');
      return;
    }

    const key = generateLicenseKey();
    await db.collection('licenses').doc(key).set({
      email: session.customer_details?.email ?? null,
      sessionId: session.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.set({
      licenseKey: key,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(200).send('ok');
  }
);

exports.issueLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    res.status(400).json({ error: 'missing session_id' });
    return;
  }
  const doc = await db.collection('sessions').doc(String(sessionId)).get();
  if (!doc.exists) {
    res.status(404).json({ found: false });
    return;
  }
  res.status(200).json({ found: true, key: doc.data().licenseKey });
});

exports.verifyLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const key = String(req.query.key || '').trim().toUpperCase();
  if (!key) {
    res.status(400).json({ valid: false });
    return;
  }
  const doc = await db.collection('licenses').doc(key).get();
  res.status(200).json({ valid: doc.exists });
});
