(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.Api = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DEFAULT_TIMEOUT = 30000;

  function makeError(code, message, extra) {
    var err = new Error(message || code);
    err.code = code;
    if (extra) {
      if (extra.status != null) err.status = extra.status;
      if (extra.details) err.details = extra.details;
    }
    return err;
  }

  function configuredUrl() {
    var config = root.APP_CONFIG || {};
    return String(config.backendUrl || '').trim().replace(/\/+$/, '');
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

  function call(action, payload, options) {
    var opts = options || {};
    var url = configuredUrl();
    if (!url) return Promise.reject(makeError('NOT_CONFIGURED', 'The backend URL is not configured.'));
    if (!action || typeof action !== 'string') return Promise.reject(makeError('INVALID_ACTION', 'Invalid action.'));
    var fetchImpl = opts.fetchImpl || root.fetch;
    if (typeof fetchImpl !== 'function') return Promise.reject(makeError('NETWORK_ERROR', 'Network access is unavailable.'));

    var body = Object.assign({ action: action }, payload || {});
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
      var status = Number(response.status) || 0;
      return response.text().then(function (text) {
        if (!response.ok) {
          try {
            return parseEnvelope(text, status);
          } catch (err) {
            if (err && err.code && err.code !== 'BAD_RESPONSE') throw err;
            throw makeError('HTTP_ERROR', 'The server request failed.', { status: status });
          }
        }
        return parseEnvelope(text, status);
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

  return {
    call: call,
    baseUrl: configuredUrl,
    isConfigured: function () { return !!configuredUrl(); }
  };
});
