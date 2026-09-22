import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../web/dist');
// Keep the finance app on the same origin and keep its existing asset base.
const finance = await readFile(path.join(output, 'index.html'), 'utf8');
if (!finance.includes('<div id="root"></div>')) throw new Error('Build the finance app before composing Pages.');
await rename(path.join(output, 'index.html'), path.join(output, 'finance.html'));
await mkdir(path.join(output, 'assets'), { recursive: true });
await writeFile(path.join(output, 'assets', 'index.html'), finance);
let html = await readFile(path.join(here, 'dist/index.html'), 'utf8');
html = html.replace('href="https://possbb.github.io/assets/finance.html"', 'href="./finance.html"');
html = html.replace(/<button\b([^>]*\bdata-app="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g, (_, attributes, app, content) => {
  const section = { godot: 3, obsidian: 2, baidu: 4, feishu: 4 }[app];
  if (section === undefined) throw new Error('Unknown desktop app: ' + app);
  const clean = attributes.replace(/\s*(?:type|data-app|aria-label)="[^"]*"/g, '');
  const label = /aria-label="([^"]*)"/.exec(attributes)?.[1] || app;
  return '<a' + clean + ' href="http://127.0.0.1:4190/#section-' + section + '" target="_blank" rel="noopener noreferrer" aria-label="前往本机个人页：' + label + '">' +
    content.replace('启动客户端', '前往本机启动').replace('启动 →', '本机启动 →') + '</a>';
});
html = html.replace('<script src="app.js"></script>', '');
html = html.replace('本地个人首页', '个人网站首页');
html = html.replace('桌面应用仅限本机', '本机启动需先运行本地个人页服务');
await writeFile(path.join(output, 'index.html'), html);
await cp(path.join(here, 'dist/style.css'), path.join(output, 'style.css'));
await mkdir(path.join(output, 'images'), { recursive: true });
await cp(path.join(here, 'dist/images'), path.join(output, 'images'), { recursive: true });
if ((html.match(/<article class="card">/g) || []).length !== 14 || html.includes('data-app=')) {
  throw new Error('Unexpected hosted navigation content');
}
console.log('Pages ready: personal homepage + finance.html + /assets/ finance entry; 14 cards preserved.');
