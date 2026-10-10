import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { launchUrl } from './dist/mobile-links.mjs';

const source = readFileSync(new URL('./dist/mobile-links.mjs', import.meta.url), 'utf8').replaceAll('export ', '');
function render(ua, bridge, id = 'douyin', standalone = false) {
  const handlers = {};
  const attrs = { href: standalone ? 'http://127.0.0.1:4190/#section-4' : 'douyin-pc://' };
  const primary = { getAttribute: key => attrs[key], setAttribute: (key, value) => attrs[key] = value,
    addEventListener: (type, handler) => { handlers[type] = handler; } };
  const web = 'https://creator.douyin.com/creator-micro/content/manage?enter_from=dou_web';
  const actions = { querySelector: selector => selector === 'button,a' ? primary : { href: web } };
  const card = { dataset: { mobileApp: id }, querySelector: selector => selector === '.app-actions' ? (standalone ? null : actions) : primary, append: () => {} };
  const navigations = [];
  vm.runInNewContext(source, {
    navigator: { userAgent: ua, platform: '', maxTouchPoints: 0 },
    document: { querySelectorAll: () => [card], createElement: () => ({ setAttribute: () => {} }) },
    window: { AndroidFiles: bridge, location: { assign: value => navigations.push(value) } }
  });
  const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
  return { primary, handlers, event, navigations, web };
}

test('desktop retains desktop controls', () => {
  assert.equal(render('Windows NT 10.0').handlers.click, undefined);
});
test('native mobile launch receives only the app identifier and stops desktop launch', () => {
  const calls = [];
  const r = render('Android', { openApp: id => calls.push(id) });
  r.handlers.click(r.event);
  assert.deepEqual(calls, ['douyin']);
  assert.ok(r.event.prevented && r.event.stopped);
  assert.equal(r.navigations.length, 0);
  assert.equal(r.primary.textContent, '手机App');
});
test('old APK uses web destination instead of unsupported intent or desktop scheme', () => {
  const r = render('Android', {});
  r.handlers.click(r.event);
  assert.deepEqual(r.navigations, [r.web]);
});
test('browser intent preserves complete creator web fallback', () => {
  const r = render('Android');
  r.handlers.click(r.event);
  assert.equal(r.navigations[0], launchUrl('douyin', r.web, true));
  assert.ok(r.navigations[0].includes(encodeURIComponent(r.web)));
});
test('hosted Obsidian loopback link becomes a mobile app route', () => {
  const calls = [];
  const r = render('Android', { openApp: id => calls.push(id) }, 'obsidian', true);
  r.handlers.click(r.event);
  assert.deepEqual(calls, ['obsidian']);
});
test('Drive keeps the chosen folder on iOS and Android', () => {
  const folder = 'https://drive.google.com/drive/u/0/folders/example';
  assert.equal(launchUrl('google-drive', folder, false), folder);
  assert.ok(launchUrl('google-drive', folder, true).startsWith('intent://drive.google.com/drive/u/0/folders/example#'));
});
