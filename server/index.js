import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8787);
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
const sessionSecret = process.env.APP_SESSION_SECRET ?? 'development-secret-change-me';
const requireActiveSubscription = process.env.REQUIRE_ACTIVE_SUBSCRIPTION === 'true';
const allowedSubscribers = new Set(
  (process.env.ALLOWED_SUBSCRIBERS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readToken(token) {
  const [encoded, signature] = String(token ?? '').split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

function getSession(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return readToken(token);
}

function subscriptionFor(email) {
  const normalized = String(email ?? '').toLowerCase();
  return {
    active: !requireActiveSubscription || allowedSubscribers.has(normalized),
    plan: allowedSubscribers.has(normalized) ? 'monthly' : 'trial',
  };
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session?.email) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }
  req.session = session;
  next();
}

function requireSubscription(req, res, next) {
  const subscription = subscriptionFor(req.session.email);
  if (!subscription.active) {
    res.status(402).json({ error: '월 구독이 활성화된 계정만 논문 생성 기능을 사용할 수 있습니다.' });
    return;
  }
  req.subscription = subscription;
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: 'v2', subscriptionMode: requireActiveSubscription ? 'required' : 'trial' });
});

app.post('/api/auth/start', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: '유효한 이메일을 입력하세요.' });
    return;
  }
  const token = signPayload({ email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  res.json({ token, user: { email }, subscription: subscriptionFor(email) });
});

app.get('/api/me', requireSession, (req, res) => {
  res.json({ user: { email: req.session.email }, subscription: subscriptionFor(req.session.email) });
});

app.post('/api/billing/checkout', requireSession, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    res.status(501).json({ error: 'Stripe 환경변수가 아직 설정되지 않았습니다.' });
    return;
  }

  const appUrl = process.env.PUBLIC_APP_URL ?? origin;
  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': process.env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    customer_email: req.session.email,
    success_url: `${appUrl}?billing=success`,
    cancel_url: `${appUrl}?billing=cancel`,
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ error: data.error?.message ?? 'Stripe checkout 생성 실패' });
    return;
  }
  res.json({ url: data.url });
});

app.post('/api/ai/respond', requireSession, requireSubscription, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되어 있지 않습니다.' });
    return;
  }

  const system = String(req.body?.system ?? '');
  const prompt = String(req.body?.prompt ?? '');
  if (!system || !prompt) {
    res.status(400).json({ error: 'system과 prompt가 필요합니다.' });
    return;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'chat-latest',
      instructions: system,
      input: prompt,
      max_output_tokens: 4096,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ error: data.error?.message ?? 'OpenAI API 요청 실패' });
    return;
  }

  const text =
    typeof data.output_text === 'string'
      ? data.output_text
      : (data.output ?? [])
          .flatMap((item) => item.content ?? [])
          .filter((content) => content.type === 'output_text' && content.text)
          .map((content) => content.text)
          .join('\n');

  res.json({ text });
});

app.listen(port, () => {
  console.log(`v2 server listening on http://127.0.0.1:${port}`);
});
