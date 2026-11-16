const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('FA and EN dictionaries have identical unique keys', function () {
  const source = read('i18n.js');
  const faStart = source.indexOf('fa: {');
  const enStart = source.indexOf('en: {');
  const keyRe = /^\s+'([^']+)':/gm;
  const fa = [...source.slice(faStart, enStart).matchAll(keyRe)].map((m) => m[1]);
  const en = [...source.slice(enStart).matchAll(keyRe)].map((m) => m[1]);
  assert.ok(fa.length > 500);
  assert.equal(new Set(fa).size, fa.length);
  assert.equal(new Set(en).size, en.length);
  assert.deepEqual(fa.slice().sort(), en.slice().sort());
});

test('all static translation keys exist and dynamic prefixes resolve', function () {
  const source = read('i18n.js');
  const faStart = source.indexOf('fa: {');
  const enStart = source.indexOf('en: {');
  const keyRe = /^\s+'([^']+)':/gm;
  const fa = new Set([...source.slice(faStart, enStart).matchAll(keyRe)].map((m) => m[1]));
  const en = new Set([...source.slice(enStart).matchAll(keyRe)].map((m) => m[1]));
  const files = fs.readdirSync(root).filter((name) => name.endsWith('.js') &&
    !['i18n.js', 'jalaali-vendor.js', 'sw.js'].includes(name));
  files.push('student/student.js');
  const used = new Set();
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(/(?:I18n\.)?\bt\(\s*'([^']+)'/g)) used.add(match[1]);
  }
  for (const key of used) {
    if (key.endsWith('.')) continue;
    assert.ok(fa.has(key), 'Missing FA key: ' + key);
    assert.ok(en.has(key), 'Missing EN key: ' + key);
  }
  for (const key of ['model.term', 'model.session', 'model.month', 'status.present', 'status.late', 'status.absent',
    'status.canceled', 'status.counted', 'status.makeup', 'status.owes', 'status.credit', 'status.paid',
    'type.private', 'type.semi', 'type.group']) {
    assert.ok(fa.has(key), 'Missing dynamic FA key: ' + key);
    assert.ok(en.has(key), 'Missing dynamic EN key: ' + key);
  }
});

test('every static icon name exists in the icon set', function () {
  const source = read('ui.js');
  const start = source.indexOf('var iconPaths = ');
  const end = source.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start);
  const iconPaths = vm.runInNewContext('(' + source.slice(start + 'var iconPaths = '.length, end + 4) + ')');
  const files = fs.readdirSync(root).filter((name) => name.endsWith('.js') &&
    !['jalaali-vendor.js', 'sw.js'].includes(name));
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(/UI\.icon\(\s*'([^']+)'/g)) {
      assert.ok(iconPaths[match[1]], 'Missing icon: ' + match[1] + ' in ' + file);
    }
  }
});

test('service worker shell references existing local files', function () {
  const source = read('sw.js');
  const match = source.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(match);
  const files = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(files.includes('./styles.css'));
  assert.ok(files.includes('./index.html'));
  assert.ok(files.includes('./config.js'));
  assert.ok(files.includes('./drive.js'));
  assert.ok(files.includes('./portal.js'));
  assert.ok(files.includes('./sync.js'));
  for (const file of files) {
    if (file === './') continue;
    assert.ok(fs.existsSync(path.join(root, file.replace(/^\.\//, ''))), 'Missing shell file: ' + file);
  }
  assert.match(source, /const VERSION = '[^']+';/);
  assert.match(source, /const CACHE_NAME = VERSION;/);
});

test('index, manifest and local asset references are consistent', function () {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 14);
  for (const script of scripts) assert.ok(fs.existsSync(path.join(root, script)), 'Missing script: ' + script);
  for (const script of ['config.js', 'drive.js', 'portal.js', 'sync.js']) assert.ok(scripts.includes(script), 'Missing teacher script: ' + script);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  for (const style of styles) assert.ok(fs.existsSync(path.join(root, style)), 'Missing style: ' + style);
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.lang, 'fa');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), 'Missing icon: ' + icon.src);
  assert.ok(fs.existsSync(path.join(root, 'apple-touch-icon.png')));
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
});

test('CSS is balanced and all custom properties are defined', function () {
  const css = read('styles.css');
  let depth = 0;
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, 'Unexpected closing brace');
  }
  assert.equal(depth, 0);
  const defs = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const refs = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  for (const ref of refs) assert.ok(defs.has(ref), 'Undefined CSS variable: ' + ref);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[data-theme="dark"\]/);
});

test('student PWA shell, manifest and CSS are consistent', function () {
  const html = read('student/index.html');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 8);
  for (const script of scripts) assert.ok(fs.existsSync(path.join(root, 'student', script)), 'Missing student script: ' + script);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  for (const style of styles) assert.ok(fs.existsSync(path.join(root, 'student', style)), 'Missing student style: ' + style);
  const manifest = JSON.parse(read('student/manifest.json'));
  assert.equal(manifest.lang, 'fa');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, 'student', icon.src)), 'Missing student icon: ' + icon.src);
  const sw = read('student/sw.js');
  const match = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(match);
  const shell = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const file of shell) {
    if (file === './') continue;
    assert.ok(fs.existsSync(path.join(root, 'student', file)), 'Missing student shell file: ' + file);
  }
  assert.match(sw, /const VERSION = 'my-class-student-v[^']+';/);
  const css = read('student/student.css');
  let depth = 0;
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, 'Unexpected student CSS closing brace');
  }
  assert.equal(depth, 0);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[data-theme="dark"\]/);
});
