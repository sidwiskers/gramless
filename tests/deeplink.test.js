import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeepLink, decodeDeepLinkPayload, createDeepLinkRouter } from '../src/deeplink.js';
import { GramlessRouter } from '../src/router.js';

test('deeplink: createDeepLink generates accurate Telegram URLs', () => {
  assert.equal(createDeepLink('GramlessBot', 'ref_123'), 'https://t.me/GramlessBot?start=ref_123');
  assert.equal(createDeepLink('@GramlessBot', 'promo code'), 'https://t.me/GramlessBot?start=promo%20code');
  assert.equal(createDeepLink('GramlessBot', 'admin_invite', { group: true }), 'https://t.me/GramlessBot?startgroup=admin_invite');
});

test('deeplink: decodeDeepLinkPayload decodes base64 and handles strings gracefully', () => {
  const original = 'user_id=42&source=telegram';
  const encoded = Buffer.from(original).toString('base64');
  assert.equal(decodeDeepLinkPayload(encoded), original);
  assert.equal(decodeDeepLinkPayload('plain_text_code'), 'plain_text_code');
  assert.equal(decodeDeepLinkPayload(''), '');
});

test('deeplink: DeepLinkRouter pattern matching and parameter extraction', async () => {
  const router = new GramlessRouter();
  const dl = createDeepLinkRouter();
  const events = [];

  // 1. Parameterized pattern
  dl.on('ref_:userId', async (ctx) => {
    events.push(`referral:${ctx.params.userId}`);
  });

  // 2. Regex pattern
  dl.on(/^item_(\d+)$/, async (ctx) => {
    events.push(`item:${ctx.match[1]}`);
  });

  // 3. Fallback for unhandled start payloads
  dl.fallback(async (ctx) => {
    events.push(`fallback:${ctx.deepLink.payload}`);
  });

  router.use(dl.middleware());

  // Standard /start handler (for users without start payload)
  router.command('start', async (ctx) => {
    events.push('standard_start');
  });

  const chat = { chat: { id: 1 }, from: { id: 1 } };

  // Test 1: Referral link
  await router.handle({ ...chat, text: '/start ref_888' });
  // Test 2: Item regex
  await router.handle({ ...chat, text: '/start item_77' });
  // Test 3: Unhandled payload -> fallback
  await router.handle({ ...chat, text: '/start unknown_campaign_tag' });
  // Test 4: Pure /start (no payload) -> reaches standard start command
  await router.handle({ ...chat, text: '/start' });

  assert.deepEqual(events, [
    'referral:888',
    'item:77',
    'fallback:unknown_campaign_tag',
    'standard_start',
  ]);
});
