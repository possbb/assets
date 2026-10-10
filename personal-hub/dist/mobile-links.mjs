// HTTPS destinations preserve web fallbacks; native packages are fixed in the APK.
export const mobileApps = {
  douyin: { name: '抖音', package: 'com.ss.android.ugc.aweme', app: 'https://www.douyin.com/' },
  xiaohongshu: { name: '小红书', package: 'com.xingin.xhs', app: 'https://www.xiaohongshu.com/' },
  'wechat-mp': { name: '公众号助手', package: 'com.tencent.mp', app: 'https://mp.weixin.qq.com/' },
  netease: { name: '网易云音乐', package: 'com.netease.cloudmusic', app: 'https://music.163.com/' },
  feishu: { name: '飞书', package: 'com.ss.android.lark', app: 'https://applink.feishu.cn/client/op/open' },
  baidu: { name: '百度网盘', package: 'com.baidu.netdisk', app: 'https://pan.baidu.com/' },
  'google-drive': { name: '谷歌云端硬盘', package: 'com.google.android.apps.docs' },
  obsidian: { name: 'Obsidian', package: 'md.obsidian', app: 'https://obsidian.md/' }
};

export function launchUrl(id, webUrl, android) {
  const app = mobileApps[id];
  if (!app || !webUrl.startsWith('https://')) return webUrl;
  const destination = app.app || webUrl;
  if (!android) return destination;
  return `intent://${destination.slice(8)}#Intent;scheme=https;package=${app.package};S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
}

if (typeof document !== 'undefined') {
  const android = /Android/i.test(navigator.userAgent);
  const mobile = android || /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (mobile) document.querySelectorAll('[data-mobile-app]').forEach(card => {
    const id = card.dataset.mobileApp;
    const app = mobileApps[id];
    if (!app) return;
    const actions = card.querySelector('.app-actions');
    const primary = actions?.querySelector('button,a') || card.querySelector('.card-action');
    const webLink = actions?.querySelector('a[href^="https:"]');
    const primaryUrl = primary?.getAttribute('href');
    const webUrl = webLink?.href || (primaryUrl?.startsWith('https://') ? primaryUrl : app.app);
    if (!primary || !webUrl?.startsWith('https://')) return;
    primary.setAttribute('aria-label', `优先打开${app.name}手机App`);
    primary.setAttribute('title', `手机优先尝试打开${app.name}，也可选择网页入口`);
    if (actions) primary.textContent = '手机App';
    const open = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof window.AndroidFiles?.openApp === 'function') {
        window.AndroidFiles.openApp(id);
      } else if (window.AndroidFiles) {
        // Old APKs reject intent: links. Open the web fallback until upgraded.
        window.location.assign(webUrl);
      } else {
        window.location.assign(launchUrl(id, webUrl, android));
      }
    };
    primary.addEventListener('click', open, true);
    if (!actions) {
      const fallback = document.createElement('a');
      fallback.className = 'mobile-web-link';
      fallback.href = webUrl;
      fallback.textContent = '网页';
      fallback.setAttribute('aria-label', `打开${app.name}网页版`);
      card.append(fallback);
    }
  });
}
