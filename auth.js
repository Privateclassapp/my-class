(function (root) {
  'use strict';

  var SESSION_KEY = 'my-class-session-v2';
  var SESSION_KEYS = {
    primary: SESSION_KEY,
    standby: SESSION_KEY + ':standby'
  };
  var TEACHER_ROLES = ['owner', 'teacher'];

  function makeError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function activeBackend() {
    if (root.Api && typeof root.Api.activeBackend === 'function') {
      var backend = root.Api.activeBackend();
      if (backend === 'standby') return 'standby';
    }
    return 'primary';
  }

  function otherBackend(backend) {
    return backend === 'standby' ? 'primary' : 'standby';
  }

  function keyFor(backend) {
    return SESSION_KEYS[backend === 'standby' ? 'standby' : 'primary'];
  }

  function storage() {
    try {
      return root.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function normalizeSession(value) {
    if (!value || typeof value !== 'object') return null;
    var user = value.user;
    if (!value.token || typeof value.token !== 'string' || !user || typeof user !== 'object' || !user.id) return null;
    if (TEACHER_ROLES.indexOf(user.role) < 0) return null;
    var expiresAtMs = Number(value.expiresAtMs);
    if (!isFinite(expiresAtMs) || expiresAtMs <= 0) return null;
    return {
      token: value.token,
      backend: value.backend === 'standby' ? 'standby' : 'primary',
      expiresAt: value.expiresAt || new Date(expiresAtMs).toISOString(),
      expiresAtMs: expiresAtMs,
      user: {
        id: String(user.id || ''),
        username: String(user.username || ''),
        role: user.role,
        displayName: String(user.displayName || user.username || ''),
        teacherId: String(user.teacherId || ''),
        status: user.status || 'active'
      }
    };
  }

  function readBackend(backend) {
    var store = storage();
    if (!store) return null;
    var key = keyFor(backend);
    var text;
    try { text = store.getItem(key); } catch (_) { return null; }
    if (!text) return null;
    var parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    var session = normalizeSession(parsed);
    if (!session) {
      try { store.removeItem(key); } catch (_) {}
      return null;
    }
    session.backend = backend === 'standby' ? 'standby' : 'primary';
    return session;
  }

  function read() {
    var backend = activeBackend();
    var other = otherBackend(backend);
    var current = readBackend(backend);
    var fallback = readBackend(other);
    if (current && !expired(current)) return current;
    if (fallback && !expired(fallback)) return fallback;
    return current || fallback;
  }

  function save(session, backend) {
    var next = normalizeSession(session);
    if (!next) throw makeError('INVALID_SESSION', 'Invalid session.');
    next.backend = backend === 'standby' ? 'standby' : 'primary';
    var store = storage();
    if (!store) throw makeError('STORAGE_UNAVAILABLE', 'Browser storage is unavailable.');
    try {
      store.setItem(keyFor(next.backend), JSON.stringify(next));
    } catch (_) {
      throw makeError('STORAGE_UNAVAILABLE', 'Browser storage is unavailable.');
    }
    return next;
  }

  function clear(backend) {
    var store = storage();
    if (!store) return;
    var names = backend === 'primary' || backend === 'standby' ? [backend] : ['primary', 'standby'];
    names.forEach(function (name) {
      try { store.removeItem(keyFor(name)); } catch (_) {}
    });
  }

  function expired(session) {
    return !!(session && Number(session.expiresAtMs) <= Date.now());
  }

  function hasSession() {
    return !!read();
  }

  function valid() {
    var session = read();
    return !!session && !expired(session);
  }

  function current() {
    return read();
  }

  function user() {
    var session = read();
    return session ? session.user : null;
  }

  function tokens() {
    var primary = readBackend('primary');
    var standby = readBackend('standby');
    return {
      primary: primary && !expired(primary) ? primary.token : '',
      standby: standby && !expired(standby) ? standby.token : ''
    };
  }

  function login(username, password) {
    if (!root.Api || !root.Api.isConfigured()) {
      return Promise.reject(makeError('NOT_CONFIGURED', 'The backend URL is not configured.'));
    }
    var name = String(username == null ? '' : username).trim().toLowerCase();
    var pass = String(password == null ? '' : password);
    if (!name || !pass) return Promise.reject(makeError('AUTH_FAILED', 'Invalid username or password.'));
    var used = 'primary';
    return root.Api.call('authLogin', { username: name, password: pass }, {
      timeout: 20000,
      onBackend: function (backend) { used = backend; }
    }).then(function (data) {
      if (!data || !data.token || !data.user || !data.user.id || TEACHER_ROLES.indexOf(data.user.role) < 0) {
        if (data && data.token) {
          root.Api.call('authLogout', { token: data.token }, { timeout: 8000, backend: used }).catch(function () {});
        }
        throw makeError('TEACHER_ONLY', 'This account is not a teacher account.');
      }
      return save({
        token: data.token,
        backend: used,
        expiresAt: data.expiresAt,
        expiresAtMs: data.expiresAtMs || (Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: data.user
      }, used);
    });
  }

  function call(action, payload, options) {
    var opts = Object.assign({}, options || {});
    var session = read();
    if (!session) return Promise.reject(makeError('AUTH_REQUIRED', 'Sign in required.'));
    if (expired(session)) return Promise.reject(makeError('AUTH_EXPIRED', 'Session expired. Sign in again.'));
    var map = tokens();
    if (!map.primary && !map.standby) return Promise.reject(makeError('AUTH_REQUIRED', 'Sign in required.'));
    if (!map[activeBackend()] && map[otherBackend(activeBackend())] && !opts.forcePrimary) {
      opts.backend = otherBackend(activeBackend());
    }
    opts.tokens = map;
    var used = opts.backend || activeBackend();
    var original = opts.onBackend;
    opts.onBackend = function (backend) {
      used = backend;
      if (typeof original === 'function') {
        try { original(backend); } catch (_) {}
      }
    };
    return root.Api.call(action, payload, opts).catch(function (err) {
      if (err && (err.code === 'AUTH_REQUIRED' || err.code === 'ACCOUNT_DISABLED')) clear(used);
      throw err;
    });
  }

  function logout() {
    var session = read();
    clear();
    if (!session || !root.Api || !root.Api.isConfigured()) return Promise.resolve();
    return root.Api.call('authLogout', { token: session.token }, {
      timeout: 10000,
      backend: session.backend === 'standby' ? 'standby' : 'primary'
    }).catch(function () {});
  }

  function status() {
    var session = read();
    return {
      hasSession: !!session,
      valid: !!session && !expired(session),
      expired: expired(session),
      session: session,
      backend: session ? session.backend : activeBackend(),
      user: session ? session.user : null
    };
  }

  root.Auth = {
    SESSION_KEY: SESSION_KEY,
    SESSION_KEYS: SESSION_KEYS,
    current: current,
    user: user,
    hasSession: hasSession,
    valid: valid,
    expired: expired,
    status: status,
    login: login,
    logout: logout,
    call: call,
    clear: clear
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
