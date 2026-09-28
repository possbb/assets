import { SESSION_KEY, SESSION_TTL, loadSitePassword, verifySitePassword, readAccess, rememberAccess, forgetAccess } from './page-lock.js';

const login = document.querySelector('#site-login');
const toolbar = document.querySelector('#site-login-toolbar');
const message = document.querySelector('#site-message');
const input = document.querySelector('#site-password');
const submit = document.querySelector('#site-submit');
let config;
let expiry = null;
let timer;
function lock() {
  clearTimeout(timer);
  expiry = null;
  document.body.classList.add('site-locked');
  login.hidden = false;
  toolbar.hidden = true;
}
function unlock(until) {
  clearTimeout(timer);
  expiry = until;
  document.body.classList.remove('site-locked');
  login.hidden = true;
  toolbar.hidden = false;
  timer = setTimeout(() => { forgetAccess(); lock(); }, Math.max(0, until - Date.now()));
}
async function refresh() {
  const next = await loadSitePassword();
  if (config && (next.salt !== config.salt || next.hash !== config.hash)) { forgetAccess(); lock(); }
  config = next;
  submit.disabled = false;
  const saved = readAccess(config);
  if (saved) unlock(saved);
  else if (!expiry || expiry <= Date.now()) lock();
  message.textContent = '';
}
document.querySelector('#site-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  try {
    config = await loadSitePassword();
    if (!await verifySitePassword(config, input.value)) { message.textContent = '密码不正确，请重试。'; return; }
    const until = Date.now() + SESSION_TTL;
    rememberAccess(config, until);
    input.value = '';
    unlock(until);
  } catch (error) { message.textContent = error.message; }
  finally { submit.disabled = false; }
});
document.querySelector('#site-logout').addEventListener('click', () => { forgetAccess(); lock(); });
window.addEventListener('storage', (event) => {
  if ((event.key === SESSION_KEY || event.key === null) && config && !readAccess(config)) lock();
});
window.addEventListener('focus', () => {
  if (expiry && expiry <= Date.now()) { forgetAccess(); lock(); }
  void refresh().catch(() => {});
});
void refresh().catch((error) => { message.textContent = `${error.message} 请刷新页面重试。`; });
