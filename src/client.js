/**
 * Gramless Mini App Client (`gramless/client`)
 * 
 * Ultra-lightweight, zero-dependency browser client for Telegram Mini Apps (TMAs).
 * Connects Mini App frontends to Gramless backend endpoints with automatic initData
 * authentication, type-safe RPC, promisified CloudStorage, and native UI/haptic shortcuts.
 */

import { parseInitData } from './init_data.js';

export class GramlessClientError extends Error {
  /**
   * @param {string} message Error message
   * @param {string} [code='CLIENT_ERROR'] Machine-readable error code
   * @param {Array<any>} [issues=[]] Validation or constraint issues
   */
  constructor(message, code = 'CLIENT_ERROR', issues = []) {
    super(message);
    this.name = 'GramlessClientError';
    this.code = code;
    this.issues = issues;
  }
}

/**
 * Creates a new Gramless Mini App client.
 * 
 * @param {Object} [options={}]
 * @param {string} [options.baseUrl='/endpoints/'] Base URL prefix for RPC endpoints
 * @param {string} [options.initData] Explicit initData string (defaults to window.Telegram.WebApp.initData)
 * @param {Record<string, any>} [options.mock] Mock identity data for local browser development outside Telegram
 * @param {typeof fetch} [options.fetch] Fetch implementation override
 * @returns {GramlessClient}
 */
export function createClient(options = {}) {
  return new GramlessClient(options);
}

export class GramlessClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || '/endpoints/').replace(/\/?$/, '/');
    this._fetch = options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this._mock = options.mock || null;

    const webApp = typeof window !== 'undefined' && window.Telegram?.WebApp ? window.Telegram.WebApp : null;
    this._webApp = webApp;

    // Resolve initData
    this.initData = options.initData || webApp?.initData || '';
    if (!this.initData && this._mock?.initData) {
      this.initData = this._mock.initData;
    }

    // Parsed initData credentials
    this._parsed = parseInitData(this.initData);
    if (!this._parsed.user && this._mock?.user) {
      this._parsed.user = this._mock.user;
    }

    // UI & Hardware controller subsystems
    this.haptic = this._createHapticController();
    this.mainButton = this._createButtonController('MainButton');
    this.secondaryButton = this._createButtonController('SecondaryButton');
    this.backButton = this._createBackButtonController();
    this.cloudStorage = this._createCloudStorageController();
    this.theme = this._createThemeController();
  }

  /**
   * Verified user object extracted from Telegram.WebApp.initData.
   * @returns {Record<string, any>|null}
   */
  get user() {
    return this._parsed.user || this._webApp?.initDataUnsafe?.user || null;
  }

  /**
   * Telegram Chat from initData if Mini App was opened in a chat.
   * @returns {Record<string, any>|null}
   */
  get chat() {
    return this._parsed.chat || this._webApp?.initDataUnsafe?.chat || null;
  }

  /**
   * Authentication date timestamp (seconds).
   * @returns {number|null}
   */
  get authDate() {
    return this._parsed.auth_date || null;
  }

  /**
   * Start parameter (?startapp=xyz) passed to the Mini App.
   * @returns {string|null}
   */
  get startParam() {
    return this._parsed.start_param || this._webApp?.initDataUnsafe?.start_param || null;
  }

  /**
   * Whether the client is running inside a live Telegram WebApp environment.
   * @returns {boolean}
   */
  get isTelegram() {
    return Boolean(this._webApp && this.initData);
  }

  /**
   * Informs Telegram that the Mini App is initialized and ready to display.
   * @returns {this}
   */
  ready() {
    this._webApp?.ready?.();
    return this;
  }

  /**
   * Expands the Mini App to the maximum available height.
   * @returns {this}
   */
  expand() {
    this._webApp?.expand?.();
    return this;
  }

  /**
   * Closes the Mini App window.
   */
  close() {
    this._webApp?.close?.();
  }

  /**
   * Sends data back to the bot via service message (Telegram.WebApp.sendData).
   * Automatically serializes objects to JSON.
   * @param {string|Record<string, any>} data
   */
  sendData(data) {
    const serialized = typeof data === 'object' ? JSON.stringify(data) : String(data);
    if (this._webApp?.sendData) {
      this._webApp.sendData(serialized);
    } else {
      console.warn('[GramlessClient] sendData called outside Telegram WebApp:', serialized);
    }
  }

  /**
   * Shares a prepared message using Bot API 8.0+ shareMessage API.
   * @param {string} preparedMessageId ID received from ctx.savePreparedInlineMessage()
   * @returns {Promise<boolean>}
   */
  async shareMessage(preparedMessageId) {
    if (typeof this._webApp?.shareMessage === 'function') {
      return new Promise((resolve) => {
        this._webApp.shareMessage(preparedMessageId, (sent) => resolve(Boolean(sent)));
      });
    }
    console.warn('[GramlessClient] shareMessage not supported in current environment');
    return false;
  }

  /**
   * Executes a type-safe RPC call against a Gramless endpoint on TGCloud.
   * Automatically injects Telegram initData for cryptographic identity verification.
   * 
   * @template T
   * @param {string} endpointName Name of the endpoint (e.g. 'submitScore', 'getProfile')
   * @param {Record<string, any>} [payload={}] Request parameters
   * @param {Object} [options={}] Fetch overrides
   * @returns {Promise<T>}
   */
  async call(endpointName, payload = {}, options = {}) {
    if (!this._fetch) {
      throw new GramlessClientError('Fetch implementation is not available in current environment', 'NO_FETCH');
    }

    const cleanName = endpointName.replace(/^\/+/, '');
    const url = `${this.baseUrl}${cleanName}`;

    const headers = {
      'Content-Type': 'application/json',
      ...(this.initData ? {
        'X-Telegram-Init-Data': this.initData,
        'Authorization': `tma ${this.initData}`,
      } : {}),
      ...(options.headers || {}),
    };

    const bodyPayload = {
      ...payload,
      ...(this.initData ? { _initData: this.initData } : {}),
    };

    const response = await this._fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
      ...options,
    });

    let resJson;
    try {
      resJson = await response.json();
    } catch (err) {
      throw new GramlessClientError(
        `Failed to parse response from ${endpointName} (HTTP ${response.status})`,
        'NETWORK_ERROR'
      );
    }

    if (resJson && typeof resJson === 'object' && resJson.ok === false) {
      throw new GramlessClientError(
        resJson.message || resJson.error || 'Endpoint call failed',
        resJson.error || 'RPC_ERROR',
        resJson.issues || []
      );
    }

    return resJson && typeof resJson === 'object' && 'data' in resJson ? resJson.data : resJson;
  }

  /**
   * @private
   */
  _createHapticController() {
    const haptic = this._webApp?.HapticFeedback;
    return {
      impact: (style = 'medium') => {
        haptic?.impactOccurred?.(style);
      },
      notification: (type = 'success') => {
        haptic?.notificationOccurred?.(type);
      },
      selection: () => {
        haptic?.selectionChanged?.();
      },
    };
  }

  /**
   * @private
   */
  _createButtonController(buttonName) {
    const btn = this._webApp?.[buttonName];
    return {
      show: (text = null, onClick = null) => {
        if (!btn) return;
        if (text) btn.setText(text);
        if (typeof onClick === 'function') {
          btn.onClick(onClick);
        }
        btn.show();
      },
      hide: () => btn?.hide?.(),
      enable: () => btn?.enable?.(),
      disable: () => btn?.disable?.(),
      setText: (text) => btn?.setText?.(text),
      showProgress: (leaveActive = false) => btn?.showProgress?.(leaveActive),
      hideProgress: () => btn?.hideProgress?.(),
      onClick: (fn) => btn?.onClick?.(fn),
      offClick: (fn) => btn?.offClick?.(fn),
      get isVisible() {
        return Boolean(btn?.isVisible);
      },
      get isActive() {
        return Boolean(btn?.isActive);
      },
    };
  }

  /**
   * @private
   */
  _createBackButtonController() {
    const bb = this._webApp?.BackButton;
    return {
      show: (onClick = null) => {
        if (!bb) return;
        if (typeof onClick === 'function') {
          bb.onClick(onClick);
        }
        bb.show();
      },
      hide: () => bb?.hide?.(),
      onClick: (fn) => bb?.onClick?.(fn),
      offClick: (fn) => bb?.offClick?.(fn),
      get isVisible() {
        return Boolean(bb?.isVisible);
      },
    };
  }

  /**
   * @private
   */
  _createCloudStorageController() {
    const cs = this._webApp?.CloudStorage;
    const memory = new Map();

    const getLocal = (key) => {
      try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
          const val = localStorage.getItem(key);
          if (val !== undefined && val !== null) return val;
        }
      } catch {}
      return memory.has(key) ? memory.get(key) : null;
    };

    const setLocal = (key, val) => {
      const str = String(val);
      try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
          localStorage.setItem(key, str);
        }
      } catch {}
      memory.set(key, str);
      return true;
    };

    const removeLocal = (key) => {
      try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
          localStorage.removeItem(key);
        }
      } catch {}
      memory.delete(key);
      return true;
    };

    return {
      getItem: (key) => {
        if (!cs) {
          return Promise.resolve(getLocal(key));
        }
        return new Promise((resolve, reject) => {
          cs.getItem(key, (err, val) => (err ? reject(err) : resolve(val || null)));
        });
      },
      setItem: (key, value) => {
        if (!cs) {
          return Promise.resolve(setLocal(key, value));
        }
        return new Promise((resolve, reject) => {
          cs.setItem(key, String(value), (err, ok) => (err ? reject(err) : resolve(Boolean(ok))));
        });
      },
      getItems: (keys) => {
        if (!cs) {
          const result = {};
          for (const k of keys) result[k] = getLocal(k);
          return Promise.resolve(result);
        }
        return new Promise((resolve, reject) => {
          cs.getItems(keys, (err, values) => (err ? reject(err) : resolve(values || {})));
        });
      },
      removeItem: (key) => {
        if (!cs) {
          return Promise.resolve(removeLocal(key));
        }
        return new Promise((resolve, reject) => {
          cs.removeItem(key, (err, ok) => (err ? reject(err) : resolve(Boolean(ok))));
        });
      },
      getKeys: () => {
        if (!cs) {
          const keys = new Set(memory.keys());
          try {
            if (typeof localStorage !== 'undefined') {
              for (const k of Object.keys(localStorage)) keys.add(k);
            }
          } catch {}
          return Promise.resolve(Array.from(keys));
        }
        return new Promise((resolve, reject) => {
          cs.getKeys((err, keys) => (err ? reject(err) : resolve(keys || [])));
        });
      },
    };
  }

  /**
   * @private
   */
  _createThemeController() {
    const webApp = this._webApp;
    return {
      get isDark() {
        return webApp?.colorScheme === 'dark';
      },
      get themeParams() {
        return webApp?.themeParams || {};
      },
      onThemeChange: (callback) => {
        webApp?.onEvent?.('themeChanged', callback);
      },
    };
  }
}

export default createClient;
