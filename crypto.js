/* crypto.js — salted PBKDF2 hash for the app PIN.
   The PIN is a screen lock, not full encryption. The raw PIN is never stored. */
(function (root) {
  'use strict';

  var ITERATIONS = 120000;

  function toEnDigits(value) {
    return String(value == null ? '' : value)
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
  }

  function bytesToBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(text) {
    var binary = atob(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function isSupported() {
    return !!(root.crypto && root.crypto.subtle && root.crypto.getRandomValues);
  }

  function normalize(pin) {
    return toEnDigits(pin).replace(/\D/g, '');
  }

  function isValid(pin) {
    return /^\d{4,6}$/.test(normalize(pin));
  }

  function newSalt() {
    var bytes = new Uint8Array(16);
    root.crypto.getRandomValues(bytes);
    return bytesToBase64(bytes);
  }

  async function derive(pin, salt, iterations) {
    if (!isSupported()) throw new Error('Web Crypto is not available');
    var enc = new TextEncoder();
    var key = await root.crypto.subtle.importKey(
      'raw', enc.encode(normalize(pin)), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    var bits = await root.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: base64ToBytes(salt), iterations: iterations || ITERATIONS, hash: 'SHA-256' },
      key,
      256
    );
    return bytesToBase64(new Uint8Array(bits));
  }

  async function create(pin) {
    if (!isValid(pin)) throw new Error('PIN must be 4 to 6 digits');
    var salt = newSalt();
    var hash = await derive(pin, salt, ITERATIONS);
    return { pinSalt: salt, pinHash: hash, pinIterations: ITERATIONS, pinVersion: 1 };
  }

  async function verify(pin, settings) {
    if (!settings || !settings.pinSalt || !settings.pinHash) return false;
    var hash = await derive(pin, settings.pinSalt, settings.pinIterations || ITERATIONS);
    var a = base64ToBytes(hash);
    var b = base64ToBytes(settings.pinHash);
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  root.Pin = {
    ITERATIONS: ITERATIONS,
    normalize: normalize,
    isValid: isValid,
    isSupported: isSupported,
    create: create,
    verify: verify
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
