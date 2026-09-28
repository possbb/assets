import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('homepage requires password, shares saved access, and supports logout', async () => {
  const source = await readFile(new URL('../../personal-hub/site-lock.js', import.meta.url), 'utf8');
  const template = await readFile(new URL('../../personal-hub/build-pages.mjs', import.meta.url), 'utf8');
  assert.ok(template.includes('<body class="site-locked">'));
  const elements = new Map();
  const classes = new Set(['site-locked']);
  const config = { salt: 'test', hash: 'test' };
  let saved = null;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', events: {}, addEventListener(name, fn) { this.events[name] = fn; } });
    return elements.get(id);
  };
  vm.runInNewContext(source.replace(/^import .*;\r?\n/, ''), {
    document: { querySelector: element, body: { classList: { add: (v) => classes.add(v), remove: (v) => classes.delete(v) } } },
    window: { addEventListener() {} },
    SESSION_KEY: 'shared', SESSION_TTL: 604800000,
    loadSitePassword: async () => config,
    verifySitePassword: async (_, password) => password === 'correct-test-password',
    readAccess: () => saved,
    rememberAccess: (_, until) => { saved = until; },
    forgetAccess: () => { saved = null; },
    setTimeout: () => 1, clearTimeout() {}, Date,
  });
  await new Promise(setImmediate);
  assert.ok(classes.has('site-locked'));
  const submit = () => element('#site-login-form').events.submit({ preventDefault() {} });
  element('#site-password').value = 'wrong';
  await submit();
  assert.ok(classes.has('site-locked'));
  element('#site-password').value = 'correct-test-password';
  await submit();
  assert.ok(!classes.has('site-locked'));
  assert.ok(saved > Date.now());
  element('#site-logout').events.click();
  assert.ok(classes.has('site-locked'));
  assert.equal(saved, null);
});
