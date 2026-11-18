(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.Api = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DEFAULT_TIMEOUT = 20000;
  var FAILURE_LIMIT = 2;
  var FAILURE_WINDOW = 5 * 60 * 1000;
  var BREAKER_MS = 5 * 60 * 1000;
  var state = {
    active: 'primary',
    failures: [],
    openUntil: 0,
    lastError: ''
  };

  function makeError(code, message, extra) {
    var err = new Error(message || code);
    err.code = code;
    if (extra) {
      if (extra.status != null) err.status = extra.status;
      if (extra.details) err.details = extra.details;
    }
    return err;
  }

  function config() {
    return root.APP_CONFIG || {};
  }

  function cleanUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function urlFor(backend) {
    var cfg = config();
    return cleanUrl(backend === 'standby' ? cfg.fallbackUrl : cfg.backendUrl);
  }

  function configuredUrl() {
    return urlFor('primary');
  }

  function fallbackUrl() {
    return urlFor('standby');
  }

  function hasFallback() {
    return !!fallbackUrl();
  }

  function parseEnvelope(text, status) {
    var payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      throw makeError('BAD_RESPONSE', 'The server returned an invalid response.', { status: status });
    }
    if (!payload || typeof payload !== 'object') {
      throw makeError('BAD_RESPONSE', 'The server returned an invalid response.', { status: status });
    }
    if (payload.ok === false) {
      var error = payload.error || {};
      throw makeError(error.code || 'SERVER_ERROR', error.message || 'The server rejected the request.', {
        status: status,
        details: error.details
      });
    }
    if (payload.ok !== true) {
      throw makeError('BAD_RESPONSE', 'The server returned an invalid response.', { status: status });
    }
    return payload.data;
  }

  function isInfrastructure(err) {
    if (!err) return false;
    var statusCode = Number(err.status) || 0;
    if (statusCode >= 500 || statusCode === 429) return true;
    if (['NETWORK_ERROR', 'TIMEOUT', 'BAD_RESPONSE'].indexOf(err.code) >= 0) return true;
    return err.code === 'HTTP_ERROR' && statusCode === 0;
  }

  function emitBackendChange() {
    if (!root.dispatchEvent || typeof root.CustomEvent !== 'function') return;
    try {
      root.dispatchEvent(new root.CustomEvent('my-class-backend-changed', { detail: status() }));
    } catch (_) {}
  }

  function setActive(backend) {
    if (state.active === backend) return;
    state.active = backend;
    emitBackendChange();
  }

  function recordSuccess(backend) {
    if (backend !== 'primary') return;
    state.failures = [];
    state.openUntil = 0;
    state.lastError = '';
    setActive('primary');
  }

  function recordFailure(backend, err) {
    if (backend !== 'primary') return;
    var now = Date.now();
    state.lastError = err && err.message ? err.message : 'Main server unavailable.';
    state.failures = state.failures.filter(function (at) { return now - at <= FAILURE_WINDOW; });
    state.failures.push(now);
    if (state.failures.length >= FAILURE_LIMIT) {
      state.openUntil = now + BREAKER_MS;
      state.failures = [now];
    }
  }

  function chooseBackend(opts) {
    if (opts.backend === 'primary' || opts.backend === 'standby') return opts.backend;
    if (opts.forcePrimary || !hasFallback()) return 'primary';
    if (state.active === 'standby' && state.openUntil > Date.now()) return 'standby';
    return 'primary';
  }

  function callBackend(backend, action, payload, opts) {
    var url = urlFor(backend);
    if (!url) return Promise.reject(makeError('NOT_CONFIGURED', 'The backend URL is not configured.'));
    var fetchImpl = opts.fetchImpl || root.fetch;
    if (typeof fetchImpl !== 'function') return Promise.reject(makeError('NETWORK_ERROR', 'Network access is unavailable.'));

    var body = Object.assign({ action: action }, payload || {});
    if (opts.tokens) {
      delete body.token;
      var token = opts.tokens[backend];
      if (token) body.token = token;
    }
    var timeout = Number(opts.timeout) > 0 ? Number(opts.timeout) : DEFAULT_TIMEOUT;
    var controller = null;
    var timer = null;
    if (typeof root.AbortController === 'function') {
      controller = new root.AbortController();
      timer = setTimeout(function () { controller.abort(); }, timeout);
    }
    var init = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow'
    };
    if (controller) init.signal = controller.signal;

    return Promise.resolve(fetchImpl(url, init)).then(function (response) {
      if (!response || typeof response.text !== 'function') {
        throw makeError('BAD_RESPONSE', 'The server returned an invalid response.');
      }
      var statusCode = Number(response.status) || 0;
      return response.text().then(function (text) {
        if (!response.ok) {
          try {
            return parseEnvelope(text, statusCode);
          } catch (err) {
            if (err && err.code && err.code !== 'BAD_RESPONSE') throw err;
            throw makeError('HTTP_ERROR', 'The server request failed.', { status: statusCode });
          }
        }
        return parseEnvelope(text, statusCode);
      });
    }).catch(function (err) {
      if (err && err.code) throw err;
      if (err && err.name === 'AbortError') throw makeError('TIMEOUT', 'The server request timed out.');
      throw makeError('NETWORK_ERROR', 'Could not reach the server.');
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function announce(opts, backend) {
    if (typeof opts.onBackend !== 'function') return;
    try { opts.onBackend(backend); } catch (_) {}
  }

  function call(action, payload, options) {
    var opts = Object.assign({}, options || {});
    if (!action || typeof action !== 'string') return Promise.reject(makeError('INVALID_ACTION', 'Invalid action.'));
    var backend = chooseBackend(opts);
    if (!urlFor(backend)) return Promise.reject(makeError('NOT_CONFIGURED', 'The backend URL is not configured.'));
    announce(opts, backend);

    return callBackend(backend, action, payload, opts).then(function (data) {
      recordSuccess(backend);
      return data;
    }, function (err) {
      if (backend !== 'primary' || opts.backend === 'standby') throw err;
      var infrastructure = isInfrastructure(err);
      var wasStandby = state.active === 'standby';
      if (infrastructure) recordFailure('primary', err);
      if (!infrastructure || opts.backend === 'primary' || opts.forcePrimary || !hasFallback() ||
          (!wasStandby && state.openUntil <= Date.now())) {
        throw err;
      }
      announce(opts, 'standby');
      return callBackend('standby', action, payload, opts).then(function (data) {
        setActive('standby');
        return data;
      });
    });
  }

  function retryPrimary(options) {
    var opts = Object.assign({}, options || {}, { forcePrimary: true });
    return call('health', {}, opts);
  }

  function status() {
    var now = Date.now();
    return {
      active: state.active,
      configured: !!configuredUrl(),
      fallbackConfigured: !!fallbackUrl(),
      primaryDown: state.openUntil > now,
      retryInMs: Math.max(0, state.openUntil - now),
      lastError: state.lastError
    };
  }

  function reset() {
    state.active = 'primary';
    state.failures = [];
    state.openUntil = 0;
    state.lastError = '';
  }

  return {
    call: call,
    retryPrimary: retryPrimary,
    status: status,
    reset: reset,
    baseUrl: configuredUrl,
    fallbackUrl: fallbackUrl,
    activeBackend: function () { return state.active; },
    isConfigured: function () { return !!configuredUrl(); }
  };
});
