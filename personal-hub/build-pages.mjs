import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from '../web/node_modules/typescript/lib/typescript.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../web/dist');
// Keep the finance app on the same origin and keep its existing asset base.
const finance = await readFile(path.join(output, 'index.html'), 'utf8');
if (!finance.includes('<div id="root"></div>')) throw new Error('Build the finance app before composing Pages.');
await rename(path.join(output, 'index.html'), path.join(output, 'finance.html'));
await mkdir(path.join(output, 'assets'), { recursive: true });
await writeFile(path.join(output, 'assets', 'index.html'), finance);
let html = await readFile(path.join(here, 'dist/index.html'), 'utf8');
const mobileSource = await readFile(path.join(here, 'dist/mobile-links.mjs'), 'utf8');
const mobileVersion = createHash('sha256').update(mobileSource).digest('hex').slice(0, 12);
html = html.replace('src="mobile-links.mjs"', `src="mobile-links.mjs?v=${mobileVersion}"`);
const lookupSource = await readFile(path.join(here, 'dist/lookup.js'), 'utf8');
const styleSource = await readFile(path.join(here, 'dist/style.css'), 'utf8');
const styleVersion = createHash('sha256').update(styleSource).digest('hex').slice(0, 12);
html = html.replace(/href="style\.css(?:\?[^"]*)?"/, `href="style.css?v=${styleVersion}"`);
const lookupVersion = createHash('sha256').update(lookupSource + finance).digest('hex').slice(0, 12);
html = html.replace(/src="lookup\.js(?:\?[^"]*)?"/, `src="lookup.js?v=${lookupVersion}"`);
html = html.replaceAll('href="https://possbb.github.io/assets/finance.html"', 'href="./finance.html"');
html = html.replace(/<button\b([^>]*\bdata-app="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g, (_, attributes, app, content) => {
  const section = { godot: 1, obsidian: 4, baidu: 4, feishu: 4, 'google-drive': 4 }[app];
  if (section === undefined) throw new Error('Unknown desktop app: ' + app);
  const clean = attributes.replace(/\s*(?:type|data-app|aria-label)="[^"]*"/g, '');
  const label = /aria-label="([^"]*)"/.exec(attributes)?.[1] || app;
  return '<a' + clean + ' href="http://127.0.0.1:4190/#section-' + section + '" target="_blank" rel="noopener noreferrer" aria-label="前往本机个人页：' + label + '">' +
    content.replace('启动客户端', '前往本机启动').replace('启动 →', '本机启动 →') + '</a>';
});
html = html.replace('<script src="app.js"></script>', '');
html = html.replace('本地个人首页', '个人网站首页');
html = html.replace('桌面应用仅限本机', '本机启动需先运行本地个人页服务');
const gate = await readFile(path.join(here, 'site-lock.html'), 'utf8');
html = html.replace('</head>', '<link rel="stylesheet" href="site-lock.css"></head>')
  .replace('<body>', '<body class="site-locked">' + gate)
  .replace('</body>', '<script type="module" src="site-lock.js"></script></body>');
const lockSource = (await readFile(path.join(here, '../web/app/lib/page-lock.ts'), 'utf8')).replace('import.meta.env.BASE_URL', 'new URL("./", import.meta.url).href');
await writeFile(path.join(output, 'page-lock.js'), ts.transpileModule(lockSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
for (const file of ['site-lock.js', 'site-lock.css']) await cp(path.join(here, file), path.join(output, file));
await writeFile(path.join(output, 'index.html'), html);
await cp(path.join(here, 'dist/style.css'), path.join(output, 'style.css'));
await cp(path.join(here, 'dist/lookup.js'), path.join(output, 'lookup.js'));
await cp(path.join(here, 'dist/mobile-links.mjs'), path.join(output, 'mobile-links.mjs'));
await mkdir(path.join(output, 'images'), { recursive: true });
await cp(path.join(here, 'dist/images'), path.join(output, 'images'), { recursive: true });
if ((html.match(/<article class="card"(?: [^>]*)?>/g) || []).length !== 26 || html.includes('data-app=')) {
  throw new Error('Unexpected hosted navigation content');
}
console.log('Pages ready: personal homepage + finance.html + /assets/ finance entry; 26 cards preserved.');
