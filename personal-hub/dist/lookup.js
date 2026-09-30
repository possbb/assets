const form = document.querySelector('#hub-lookup-form');
const input = document.querySelector('#hub-lookup-input');
const panel = document.querySelector('#hub-lookup-results');
const close = document.querySelector('#hub-lookup-close');
const status = document.querySelector('#hub-lookup-status');
const finance = new URL(document.querySelector('#hub-finance-link').href);
finance.hash = 'home-lookup';
let frame;
let query = '';
let timeout;
function send() {
  if (frame && !document.body.classList.contains('site-locked')) {
    frame.contentWindow.postMessage({ type: 'hub-lookup-query', query }, finance.origin);
  }
}
function clear() {
  clearTimeout(timeout);
  frame?.remove();
  frame = null;
  panel.hidden = true;
  close.hidden = true;
  query = '';
  input.value = '';
  status.textContent = '';
}
window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== finance.origin || event.data?.type !== 'hub-lookup-ready') return;
  clearTimeout(timeout);
  status.textContent = '查询结果显示在下方。';
  send();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (document.body.classList.contains('site-locked')) return;
  query = input.value.trim();
  if (!query) { input.focus(); return; }
  panel.hidden = false;
  close.hidden = false;
  if (!frame) {
    status.textContent = '正在打开快速查询；如提示访问密码，请先完成验证。';
    frame = document.createElement('iframe');
    frame.title = '家财管家快速查询结果';
    frame.src = finance.href;
    frame.addEventListener('load', send);
    panel.append(frame);
    timeout = setTimeout(() => { status.textContent = '若下方未显示查询结果，请完成访问验证，或点击“打开家财管家”。'; }, 15000);
  } else send();
});
close.addEventListener('click', clear);
new MutationObserver(() => {
  if (document.body.classList.contains('site-locked')) clear();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
