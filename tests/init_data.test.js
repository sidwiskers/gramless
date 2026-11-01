import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInitData,
  parseInitData,
  timingSafeEqual,
  initDataAuth,
} from '../src/init_data.js';

describe('gramless/init-data: Cryptographic Mini App Authentication', () => {
  const BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567';

  // Helper function to sign test initData using Web Crypto
  async function createSignedInitData(dataObj, botToken) {
    const enc = new TextEncoder();
    const sortedKeys = Object.keys(dataObj).filter((k) => k !== 'hash').sort();
    const dataCheckParts = sortedKeys.map((k) => `${k}=${dataObj[k]}`);
    const dataCheckString = dataCheckParts.join('\n');

    const webAppDataKey = await crypto.subtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKeyBytes = await crypto.subtle.sign(
      'HMAC',
      webAppDataKey,
      enc.encode(botToken)
    );

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBytes = await crypto.subtle.sign('HMAC', secretKey, enc.encode(dataCheckString));
    const hash = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(dataObj)) {
      params.set(k, v);
    }
    params.set('hash', hash);
    return params.toString();
  }

  describe('timingSafeEqual', () => {
    it('returns true for matching strings and false for mismatches', () => {
      assert.equal(timingSafeEqual('abcdef', 'abcdef'), true);
      assert.equal(timingSafeEqual('abcdef', 'abcdeg'), false);
      assert.equal(timingSafeEqual('abcdef', 'abcde'), false);
      assert.equal(timingSafeEqual('', ''), true);
      assert.equal(timingSafeEqual(null, 'abc'), false);
    });
  });

  describe('parseInitData', () => {
    it('parses raw query string and unpacks JSON user', () => {
      const qs = 'query_id=AAHd&user=%7B%22id%22%3A123456%2C%22first_name%22%3A%22Alex%22%2C%22is_premium%22%3Atrue%7D&auth_date=1620000000&hash=abc';
      const parsed = parseInitData(qs);

      assert.equal(parsed.query_id, 'AAHd');
      assert.equal(parsed.auth_date, 1620000000);
      assert.equal(parsed.hash, 'abc');
      assert.deepEqual(parsed.user, { id: 123456, first_name: 'Alex', is_premium: true });
    });

    it('handles query strings with leading question mark', () => {
      const parsed = parseInitData('?auth_date=1000&test=true');
      assert.equal(parsed.auth_date, 1000);
      assert.equal(parsed.test, 'true');
    });
  });

  describe('validateInitData', () => {
    it('successfully validates authentic Telegram initData', async () => {
      const payload = {
        query_id: 'AAHd123',
        auth_date: '1700000000',
        user: JSON.stringify({ id: 987654, first_name: 'TelegramUser' }),
      };

      const signedInitData = await createSignedInitData(payload, BOT_TOKEN);
      const result = await validateInitData(signedInitData, BOT_TOKEN, {
        now: 1700000100, // 100s later (within 86400s maxAge)
      });

      assert.equal(result.ok, true);
      assert.equal(result.data.query_id, 'AAHd123');
      assert.equal(result.data.user.id, 987654);
    });

    it('rejects tampered initData with INVALID_SIGNATURE', async () => {
      const payload = {
        query_id: 'AAHd123',
        auth_date: '1700000000',
        user: JSON.stringify({ id: 987654, first_name: 'LegitUser' }),
      };

      const signedInitData = await createSignedInitData(payload, BOT_TOKEN);
      // Tamper user ID in the query string
      const tampered = signedInitData.replace('987654', '111111');

      const result = await validateInitData(tampered, BOT_TOKEN);
      assert.equal(result.ok, false);
      assert.equal(result.error, 'INVALID_SIGNATURE');
    });

    it('rejects expired initData when maxAge is exceeded', async () => {
      const payload = {
        query_id: 'AAHd123',
        auth_date: '1700000000',
      };

      const signedInitData = await createSignedInitData(payload, BOT_TOKEN);
      const result = await validateInitData(signedInitData, BOT_TOKEN, {
        now: 1700100000, // 100,000s later (> default 86400s)
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, 'EXPIRED');
    });

    it('rejects missing hash and missing arguments', async () => {
      const noHash = await validateInitData('query_id=123', BOT_TOKEN);
      assert.equal(noHash.error, 'MISSING_HASH');

      const noToken = await validateInitData('hash=123', null);
      assert.equal(noToken.error, 'MISSING_BOT_TOKEN');
    });
  });

  describe('initDataAuth Middleware', () => {
    it('authenticates valid initData and attaches user to context', async () => {
      const payload = {
        auth_date: '1700000000',
        user: JSON.stringify({ id: 777, first_name: 'Lucky' }),
      };
      const signedInitData = await createSignedInitData(payload, BOT_TOKEN);

      const middleware = initDataAuth(BOT_TOKEN, { now: 1700000010 });
      const ctx = { input: { initData: signedInitData } };

      let nextCalled = false;
      await middleware(ctx, async () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(ctx.user.id, 777);
      assert.equal(ctx.initData.auth_date, 1700000000);
    });

    it('rejects request with 401 when initData is missing and not optional', async () => {
      const middleware = initDataAuth(BOT_TOKEN);
      const ctx = { input: {} };

      const res = await middleware(ctx, async () => {});
      assert.equal(res.ok, false);
      assert.equal(res.error, 'UNAUTHORIZED');
    });
  });
});
