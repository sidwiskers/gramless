/**
 * Gramless Mini App UI & HTML Generator (`gramless/webapp`)
 * 
 * Generates zero-build, pixel-perfect Telegram Mini App (TMA) HTML pages
 * conforming directly to Telegram design guidelines and theme variables.
 */

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates the standard Telegram Mini App CSS stylesheet.
 * Leverages native Telegram theme variables with polished system fallbacks.
 * 
 * @returns {string}
 */
export function getTelegramThemeCss() {
  return `
    :root {
      --bg-color: var(--tg-theme-bg-color, #ffffff);
      --text-color: var(--tg-theme-text-color, #000000);
      --hint-color: var(--tg-theme-hint-color, #999999);
      --link-color: var(--tg-theme-link-color, #2481cc);
      --button-color: var(--tg-theme-button-color, #2481cc);
      --button-text-color: var(--tg-theme-button-text-color, #ffffff);
      --secondary-bg: var(--tg-theme-secondary-bg-color, #f4f4f5);
      --header-bg: var(--tg-theme-header-bg-color, #ffffff);
      --section-bg: var(--tg-theme-section-bg-color, #ffffff);
      --section-separator: var(--tg-theme-section-separator-color, #e5e7eb);
      --destructive-text: var(--tg-theme-destructive-text-color, #ff3b30);
      --border-radius: 12px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: var(--tg-theme-bg-color, #17212b);
        --text-color: var(--tg-theme-text-color, #f5f5f5);
        --hint-color: var(--tg-theme-hint-color, #708499);
        --link-color: var(--tg-theme-link-color, #6ab2f2);
        --button-color: var(--tg-theme-button-color, #5288c1);
        --button-text-color: var(--tg-theme-button-text-color, #ffffff);
        --secondary-bg: var(--tg-theme-secondary-bg-color, #0e1621);
        --header-bg: var(--tg-theme-header-bg-color, #17212b);
        --section-bg: var(--tg-theme-section-bg-color, #17212b);
        --section-separator: var(--tg-theme-section-separator-color, #242f3d);
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.45;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
      -webkit-user-select: none;
    }

    .tma-container {
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .tma-card {
      background: var(--section-bg);
      border: 1px solid var(--section-separator);
      border-radius: var(--border-radius);
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .tma-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .tma-hint {
      color: var(--hint-color);
      font-size: 14px;
      margin-bottom: 16px;
    }

    .tma-btn {
      display: block;
      width: 100%;
      padding: 14px 18px;
      border: none;
      border-radius: var(--border-radius);
      background-color: var(--button-color);
      color: var(--button-text-color);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: opacity 0.15s ease, transform 0.05s ease;
      text-decoration: none;
    }

    .tma-btn:active {
      opacity: 0.85;
      transform: scale(0.99);
    }

    .tma-btn-secondary {
      background-color: var(--secondary-bg);
      color: var(--link-color);
      margin-top: 10px;
    }

    .tma-input-group {
      margin-bottom: 16px;
    }

    .tma-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--hint-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .tma-input {
      width: 100%;
      padding: 12px 14px;
      font-size: 16px;
      border-radius: 8px;
      border: 1px solid var(--section-separator);
      background-color: var(--secondary-bg);
      color: var(--text-color);
      outline: none;
      transition: border-color 0.2s ease;
    }

    .tma-input:focus {
      border-color: var(--link-color);
    }
  `;
}

/**
 * Renders a full, self-contained Telegram Mini App HTML page string.
 * Perfect for zero-build static hosting in TGCloud's `public/index.html`.
 * 
 * @param {Object} [options={}]
 * @param {string} [options.title='Telegram Mini App'] Page title
 * @param {string} [options.body=''] Inner HTML content for container
 * @param {string} [options.styles=''] Additional custom CSS
 * @param {string} [options.scripts=''] Additional custom client-side JavaScript
 * @param {boolean} [options.includeTelegramScript=true] Whether to include telegram-web-app.js
 * @returns {string} Fully rendered HTML document
 */
export function renderMiniAppHtml(options = {}) {
  const title = escapeHtml(options.title || 'Telegram Mini App');
  const bodyContent = options.body || `
    <div class="tma-card">
      <h1 class="tma-title">${title}</h1>
      <p class="tma-hint">Powered by Gramless on Telegram Serverless.</p>
    </div>
  `;
  const customStyles = options.styles || '';
  const customScripts = options.scripts || '';
  const includeTelegram = options.includeTelegramScript !== false;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${title}</title>
  ${includeTelegram ? '<script src="https://telegram.org/js/telegram-web-app.js"></script>' : ''}
  <style>
    ${getTelegramThemeCss()}
    ${customStyles}
  </style>
</head>
<body>
  <div class="tma-container">
    ${bodyContent}
  </div>
  <script>
    (function() {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
    })();
    ${customScripts}
  </script>
</body>
</html>`;
}

export default renderMiniAppHtml;
