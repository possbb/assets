import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../app/components/QuickLookup.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('require', 'exports', compiled)(require, exports);
test('homepage query uses existing multi-keyword lookup and handles no matches', () => {
  const state = { documents: [
    { id: '1', name: '示例银行甲', type: '账户资料', owner: '测试甲', institution: '示例银行', accountNumber: 'TEST-001', status: '有效' },
    { id: '2', name: '示例护照乙', type: '证照', owner: '测试乙', status: '有效' },
  ] };
  const html = renderToStaticMarkup(React.createElement(exports.QuickLookup, { state, initialQuery: '示例银行 测试甲' }));
  assert.match(html, /示例银行甲/); assert.doesNotMatch(html, /示例护照乙/);
  assert.match(renderToStaticMarkup(React.createElement(exports.QuickLookup, { state, initialQuery: '不存在' })), /没有匹配结果/);
  assert.equal(exports.matchesQuery('ＴＥＳＴ001', ['TEST001']), true);
});
test('homepage bridge checks frame origin/source, sends no query in URL, clears on lock', () => {
  const listeners = {}, nodes = {}, messages = []; let observer;
  const body = { locked: false, classList: { contains: () => body.locked } };
  function element() { return { value: '', hidden: true, textContent: '', events: {}, addEventListener(t, f) { this.events[t] = f; }, append(f) { this.child = f; }, remove() { this.removed = true; }, focus() {} }; }
  for (const id of ['hub-lookup-form','hub-lookup-input','hub-lookup-results','hub-lookup-close','hub-lookup-status','hub-finance-link']) nodes[id] = element();
  nodes['hub-finance-link'].href = 'https://possbb.github.io/assets/finance.html';
  const context = { URL, setTimeout: () => 1, clearTimeout() {}, document: { body, querySelector: s => nodes[s.slice(1)], createElement() { return { ...element(), contentWindow: { postMessage: (data, origin) => messages.push({data, origin}) } }; } }, window: { addEventListener: (t, f) => { listeners[t] = f; } }, MutationObserver: class { constructor(f) { observer = f; } observe() {} } };
  vm.runInNewContext(readFileSync(new URL('../../personal-hub/dist/lookup.js', import.meta.url), 'utf8'), context);
  nodes['hub-lookup-input'].value = '测试 银行'; nodes['hub-lookup-form'].events.submit({preventDefault(){}});
  const frame = nodes['hub-lookup-results'].child;
  assert.equal(frame.src, 'https://possbb.github.io/assets/finance.html#home-lookup');
  listeners.message({ source: frame.contentWindow, origin: 'https://evil.example', data: {type:'hub-lookup-ready'} }); assert.equal(messages.length,0);
  listeners.message({ source: {}, origin: 'https://possbb.github.io', data: {type:'hub-lookup-ready'} }); assert.equal(messages.length,0);
  listeners.message({ source: frame.contentWindow, origin: 'https://possbb.github.io', data: {type:'hub-lookup-ready'} });
  assert.equal(messages[0].data.query, '测试 银行'); assert.equal(messages[0].origin, 'https://possbb.github.io');
  body.locked = true; observer(); assert.equal(frame.removed, true); assert.equal(nodes['hub-lookup-input'].value, ''); assert.equal(nodes['hub-lookup-results'].hidden, true);
});
