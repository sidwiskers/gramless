import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n } from '../src/i18n.js';
import { GramlessRouter } from '../src/router.js';

test('i18n: dot-notation key lookup and variable interpolation', () => {
  const i18n = createI18n({
    defaultLocale: 'en',
    locales: {
      en: {
        greeting: 'Hello, {name}!',
        menu: {
          profile: {
            title: 'Your Account: {username}',
          },
        },
      },
    },
  });

  assert.equal(i18n.t('en', 'greeting', { name: 'Alex' }), 'Hello, Alex!');
  assert.equal(i18n.t('en', 'menu.profile.title', { username: 'alexp' }), 'Your Account: alexp');
  assert.equal(i18n.t('en', 'unknown.key'), 'unknown.key');
});

test('i18n: pluralization with pipe syntax (2-part and 3-part)', () => {
  const i18n = createI18n({
    defaultLocale: 'en',
    locales: {
      en: {
        stars: 'No stars | 1 star | {count} stars',
        items: '{count} item | {count} items',
      },
    },
  });

  // 3-part: zero, one, other
  assert.equal(i18n.t('en', 'stars', { count: 0 }), 'No stars');
  assert.equal(i18n.t('en', 'stars', { count: 1 }), '1 star');
  assert.equal(i18n.t('en', 'stars', { count: 42 }), '42 stars');

  // 2-part: one, other
  assert.equal(i18n.t('en', 'items', { count: 1 }), '1 item');
  assert.equal(i18n.t('en', 'items', { count: 5 }), '5 items');
  assert.equal(i18n.t('en', 'items', { count: 0 }), '0 items');
});

test('i18n: fallback to defaultLocale when key is missing in target locale', () => {
  const i18n = createI18n({
    defaultLocale: 'en',
    locales: {
      en: {
        shared: 'Shared in English',
        only_en: 'English only',
      },
      es: {
        shared: 'Compartido en Español',
      },
    },
  });

  assert.equal(i18n.t('es', 'shared'), 'Compartido en Español');
  assert.equal(i18n.t('es', 'only_en'), 'English only');
});

test('i18n: router middleware auto-detects language and sets ctx.t', async () => {
  const router = new GramlessRouter();
  const i18n = createI18n({
    defaultLocale: 'en',
    locales: {
      en: { welcome: 'Welcome!' },
      fr: { welcome: 'Bienvenue!' },
    },
  });

  router.use(i18n.middleware());

  let receivedGreeting = null;
  router.command('start', async (ctx) => {
    receivedGreeting = ctx.t('welcome');
  });

  // French user
  await router.handle({
    chat: { id: 1 },
    from: { id: 1, language_code: 'fr' },
    text: '/start',
  });
  assert.equal(receivedGreeting, 'Bienvenue!');

  // Default English user
  await router.handle({
    chat: { id: 2 },
    from: { id: 2 },
    text: '/start',
  });
  assert.equal(receivedGreeting, 'Welcome!');
});
