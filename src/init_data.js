/**
 * Gramless: Cryptographic Telegram Mini App (tApp) Auth Engine
 * 
 * Implements Telegram's WebApp initData HMAC-SHA256 verification specification
 * with zero dependencies using the universal Web Crypto API (`crypto.subtle`).
 * 
 * Works seamlessly across V8 Isolates, TGCloud, Cloudflare Workers, Deno, Bun, and Node 18+.
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const charA = a.charCodeAt(i % a.length) || 0;
    const charB = b.charCodeAt(i % b.length) || 0;
    mismatch |= (charA ^ charB);
  }
  return mismatch === 0;
}

/**
 * Parses raw Telegram Mini App initData query string into a structured object.
 * Automatically parses JSON fields (such as `user` and `receiver`).
 * 
 * @param {string} initData Raw URL-encoded initData string
 * @returns {Record<string, any>}
 */
export function parseInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    return {};
  }

  // Handle optional leading '?'
  const cleanStr = initData.startsWith('?') ? initData.slice(1) : initData;
  const params = new URLSearchParams(cleanStr);
  const result = {};

  for (const [key, value] of params.entries()) {
    if (key === 'user' || key === 'receiver' || key === 'chat') {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    } else if (key === 'auth_date') {
      const parsedInt = parseInt(value, 10);
      result[key] = Number.isNaN(parsedInt) ? value : parsedInt;
    } else if (key === 'can_send_after') {
      const parsedInt = parseInt(value, 10);
      result[key] = Number.isNaN(parsedInt) ? value : parsedInt;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Cryptographically validates Telegram Mini App initData using HMAC-SHA256.
 * 
 * Specification: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * 
 * @param {string} initData Raw query string from Telegram.WebApp.initData
 * @param {string} botToken Bot API token (e.g. "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11")
 * @param {Object} [options={}]
 * @param {number} [options.maxAge=86400] Maximum token age in seconds (replay prevention). Set to 0 to disable.
 * @param {number} [options.now] Optional timestamp override in seconds (useful for deterministic testing).
 * @returns {Promise<{ ok: boolean, data?: Record<string, any>, error?: string, message?: string }>}
 */
export async function validateInitData(initData, botToken, options = {}) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'MISSING_INIT_DATA', message: 'initData string is required' };
  }
  if (!botToken || typeof botToken !== 'string') {
    return { ok: false, error: 'MISSING_BOT_TOKEN', message: 'botToken is required for verification' };
  }

  const cleanStr = initData.startsWith('?') ? initData.slice(1) : initData;
  const params = new URLSearchParams(cleanStr);
  const hash = params.get('hash');

  if (!hash) {
    return { ok: false, error: 'MISSING_HASH', message: 'initData does not contain hash parameter' };
  }

  // Remove hash and sort remaining keys alphabetically
  params.delete('hash');
  const sortedKeys = Array.from(params.keys()).sort();
  const dataCheckParts = [];

  for (const key of sortedKeys) {
    dataCheckParts.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = dataCheckParts.join('\n');

  try {
    const enc = new TextEncoder();
    const cryptoSubtle = globalThis.crypto?.subtle;

    if (!cryptoSubtle) {
      return {
        ok: false,
        error: 'CRYPTO_UNAVAILABLE',
        message: 'Web Crypto API (crypto.subtle) is not available in this environment',
      };
    }

    // 1. Derivation: HMAC-SHA256("WebAppData", botToken)
    const webAppDataKey = await cryptoSubtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKeyBytes = await cryptoSubtle.sign(
      'HMAC',
      webAppDataKey,
      enc.encode(botToken)
    );

    // 2. Signature: HMAC-SHA256(secretKeyBytes, dataCheckString)
    const secretKey = await cryptoSubtle.importKey(
      'raw',
      secretKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await cryptoSubtle.sign(
      'HMAC',
      secretKey,
      enc.encode(dataCheckString)
    );

    // Format signature as lowercase hex string
    const hex = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time verification
    if (!timingSafeEqual(hex.toLowerCase(), hash.toLowerCase())) {
      return { ok: false, error: 'INVALID_SIGNATURE', message: 'Cryptographic hash mismatch' };
    }

    // 3. Replay Protection: Check auth_date expiration
    const parsedData = parseInitData(initData);
    const maxAge = options.maxAge !== undefined ? options.maxAge : 86400; // 24 hours default
    if (maxAge > 0 && typeof parsedData.auth_date === 'number') {
      const currentSeconds = options.now !== undefined ? options.now : Math.floor(Date.now() / 1000);
      const age = currentSeconds - parsedData.auth_date;
      if (age > maxAge) {
        return {
          ok: false,
          error: 'EXPIRED',
          message: `initData has expired (age: ${age}s > max: ${maxAge}s)`,
          data: parsedData,
        };
      }
    }

    return { ok: true, data: parsedData };
  } catch (err) {
    return {
      ok: false,
      error: 'VERIFICATION_FAILED',
      message: err.message || 'Verification failed unexpectedly',
    };
  }
}

/**
 * Creates an authentication middleware for Gramless Mini App endpoints.
 * Automatically verifies incoming `Authorization: tma <initData>` header or `initData` input parameter.
 * 
 * @param {string} botToken
 * @param {Object} [options={}]
 * @returns {Function}
 */
export function initDataAuth(botToken, options = {}) {
  return async function initDataAuthMiddleware(ctx, next) {
    const rawInitData = ctx.raw?.initData || ctx.initData || ctx.input?.initData;
    if (!rawInitData) {
      if (options.optional) {
        return next();
      }
      return { ok: false, error: 'UNAUTHORIZED', message: 'initData is required' };
    }

    const validation = await validateInitData(rawInitData, botToken, options);
    if (!validation.ok) {
      return { ok: false, error: 'UNAUTHORIZED', message: validation.message, details: validation.error };
    }

    ctx.initData = validation.data;
    ctx.user = validation.data.user || null;
    return next();
  };
}

export default {
  validateInitData,
  parseInitData,
  timingSafeEqual,
  initDataAuth,
};
