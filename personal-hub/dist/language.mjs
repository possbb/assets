const messages = {
  'CHEN的工作台': "CHEN's Workspace",
  '我的网站、创作工具与桌面应用总览': 'My websites, creative tools and desktop apps',
  '资料查询': 'Quick search', '打开家财管家 ↗': 'Open Family Finance ↗',
  '证照与银行账户资料': 'Documents and bank account details',
  '搜索证照与银行账户资料': 'Search documents and bank accounts',
  '查询': 'Search', '收起': 'Hide',
  '生活与资产': 'Life & Finance', '西班牙': 'Spain',
  '文件与协作': 'Files & Collaboration', '创作与发布': 'Create & Publish',
  '家财管家': 'Family Finance', '账户、资产与家庭收支': 'Accounts, assets and household budgets',
  '金融观察': 'Market Watch', '市场动态与理财观察': 'Market trends and financial insights',
  '消费看板': 'Spending Dashboard', '账单分析与分类消费': 'Spending analysis by category',
  '代办与日常': 'Tasks & Daily Life', '日程安排与日常事项': 'Schedules and everyday tasks',
  'Upwork推荐工作': 'Upwork Job Matches', '自由职业与项目机会': 'Freelance work and opportunities',
  '巴塞罗那·西班牙历史文化笔记': 'Barcelona & Spain History Notes',
  '家附近 · Barcelona 小小探索地图': 'Near Home · Barcelona Family Map',
  '一年级时间轴 · La Salle Bonanova': 'Grade 1 Timeline · La Salle Bonanova',
  'La Salle Bonanova校园媒体聚合': 'La Salle Bonanova School News',
  '小娃画作前台': "Kids' Art Gallery", '小娃画作后台': "Kids' Art Management",
  '本机抖音客户端': 'Douyin Desktop', '抖音': 'Douyin', '公众号助手': 'WeChat Subscription Assistant',
  '西班牙研究': 'Spain Research', '气候、学校与租房研究': 'Climate, schools and housing',
  '识图档案': 'Image Notes', '照片、标注与知识收藏': 'Photos, annotations and discoveries',
  '历史文化笔记': 'History & Culture', '巴塞罗那与西班牙历史': 'Barcelona and Spanish history',
  '家附近': 'Near Home', '发现家附近的去处': 'Discover places nearby',
  '一年级时间轴': 'Grade 1 Timeline', '课表、课外活动与接送': 'Classes, activities and pickups',
  '校园媒体聚合': 'School News', 'La Salle Bonanova 校园动态': 'Updates from La Salle Bonanova',
  '百度网盘': 'Baidu Netdisk', '文件存储与备份': 'File storage and backups',
  '谷歌云端硬盘': 'Google Drive', '云端文件与同步': 'Cloud files and syncing',
  '飞书': 'Feishu', '团队协作与沟通': 'Teamwork and communication',
  '资料整理与 AI 问答': 'Research and AI answers', '本地知识库与笔记': 'Local notes and knowledge',
  'AI 音乐创作': 'AI music creation', '网易云音乐': 'NetEase Music',
  '音乐发现与歌单收藏': 'Discover music and playlists', '微信公众平台': 'WeChat Publishing',
  '游戏和西班牙生活': 'Games & life in Spain', '小娃画作': "Kids' Art Gallery",
  '孩子的画作与成长': 'Artwork and growing-up memories', '前台': 'Gallery', '后台': 'Manage',
  '抖音视频管理': 'Douyin Videos', '音乐、游戏': 'Music & games',
  '中西像素对照': 'China–Spain Pixels', '中西文化像素对比': 'Pixel views of Chinese and Spanish culture',
  '小红书': 'RED', '小红书笔记管理': 'Xiaohongshu Posts', '中西文化差异': 'China–Spain culture',
  '游戏美术与素材管理': 'Game art and assets', '游戏开发与项目管理': 'Game development and projects',
  '本机': 'Desktop', '网页': 'Web', '手机App': 'App', '刷新线上内容': 'Refresh',
  '桌面应用仅限本机': 'Desktop apps require this computer',
  '本机启动需先运行本地个人页服务': 'Desktop launch requires the local homepage service',
  '网站登录': 'Website sign-in', '欢迎回来': 'Welcome back', '访问密码': 'Access password',
  '请输入网站访问密码。与家财管家共用登录状态，此浏览器 7 天内免重复输入。': 'Enter your access password. Sign-in is shared with Family Finance and remembered for 7 days in this browser.',
  '进入网站': 'Enter workspace', '正在读取密码配置…': 'Loading sign-in settings…',
  '请启用 JavaScript 后登录。': 'Enable JavaScript to sign in.',
  '已登录 · 共用设备请在使用后退出': 'Signed in · Sign out when using a shared device',
  '退出并锁定': 'Sign out & lock', '密码不正确，请重试。': 'Incorrect password. Please try again.',
  '查询结果显示在下方。': 'Search results appear below.',
  '正在打开快速查询；如提示访问密码，请先完成验证。': 'Opening search. Enter your access password if prompted.',
  '家财管家快速查询结果': 'Family Finance search results',
  '若下方未显示查询结果，请完成访问验证，或点击“打开家财管家”。': 'If results do not appear, sign in below or select “Open Family Finance”.'
};

export function english(text) {
  if (messages[text]) return messages[text];
  const mobileHint = text.match(/^手机优先尝试打开(.+)，也可选择网页入口$/);
  if (mobileHint) return `Try ${messages[mobileHint[1]] || mobileHint[1]} first, or use the web link`;
  const mobile = text.match(/^优先打开(.+)手机App$/);
  if (mobile) return `Open ${messages[mobile[1]] || mobile[1]} app first`;
  const desktop = text.match(/^(?:启动|前往本机个人页：启动)(.+)$/);
  if (desktop) return `Launch ${messages[desktop[1]] || desktop[1]} on this computer`;
  const web = text.match(/^打开(.+)网页版(?:（官方网站，新标签页）)?$/);
  if (web) return `Open ${messages[web[1]] || web[1]} on the web`;
  const link = text.match(/^(?:打开|进入)(.+)（新标签页）$/);
  if (link) return `Open ${messages[link[1]] || link[1]} (new tab)`;
  const open = text.match(/^打开(.+)$/);
  if (open) return `Open ${messages[open[1]] || open[1]}`;
  return text;
}

if (typeof document !== 'undefined') {
  const key = 'chen-workspace-language';
  let language = 'zh';
  try { if (localStorage.getItem(key) === 'en') language = 'en'; } catch {}
  const originals = new WeakMap();
  function translated(node, slot, value) {
    let saved = originals.get(node);
    if (!saved) originals.set(node, saved = new Map());
    let record = saved.get(slot);
    if (!record || record.output !== value) record = { original: value };
    record.output = language === 'en' ? english(record.original) : record.original;
    saved.set(slot, record);
    return record.output;
  }
  function render() {
    observer.disconnect();
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('script,style,[data-language-switch]')) continue;
      const next = translated(node, 'text', node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    document.querySelectorAll('[aria-label],[placeholder],[title],meta[name="description"]').forEach(node => {
      if (node.closest('[data-language-switch]')) return;
      for (const attr of ['aria-label', 'placeholder', 'title', 'content']) {
        if (!node.hasAttribute(attr)) continue;
        const next = translated(node, attr, node.getAttribute(attr));
        if (next !== node.getAttribute(attr)) node.setAttribute(attr, next);
      }
    });
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['aria-label', 'placeholder', 'title'] });
  }
  const observer = new MutationObserver(render);
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
    language = button.dataset.language;
    try { localStorage.setItem(key, language); } catch {}
    render();
  }));
  render();
}
