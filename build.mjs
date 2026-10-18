import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, pbkdf2Sync, createCipheriv, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const password = process.argv[2] || process.env.SITE_PASSWORD;

if (!password || password.trim().length < 6) {
  console.error('用法: node build.mjs <密码>   或   SITE_PASSWORD=xxx node build.mjs');
  console.error('密码至少 6 位。');
  process.exit(1);
}

// 密码不区分大小写：加密和解密两端都先归一化
const normalize = (value) => value.trim().toLowerCase();

const ITERATIONS = 250000;
const SRC_DIR = join(here, 'src');
const SOURCE = join(SRC_DIR, 'index.html');
const SHELL = join(here, 'index.html');
const PAYLOAD_FILE = join(here, 'site-v3.3.1.enc');

let plaintext = await readFile(SOURCE, 'utf8');

// 把所有本地样式表内联进密文：解密后样式与 HTML 同时到位，不会有"无样式闪白"那一帧
async function inlineLocalStyles(html) {
  const linkPattern = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;
  const tags = html.match(linkPattern) || [];
  let out = html;

  for (const tag of tags) {
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (/^(https?:)?\/\//i.test(href) || href.indexOf('data:') === 0) continue;

    const file = href.split('?')[0].split('#')[0];
    let css;
    try {
      css = await readFile(join(SRC_DIR, file), 'utf8');
      // A UTF-8 BOM becomes part of the first selector in an inline style block.
      css = css.replace(/^\uFEFF/, '');
    } catch {
      console.warn(`警告: 找不到 ${file}，该样式保留外链；解密后可能闪一下无样式内容`);
      continue;
    }
    if (css.includes('</style')) {
      console.warn(`警告: ${file} 含 </style 片段，该样式保留外链`);
      continue;
    }
    out = out.replace(tag, () => `<style>\n${css}\n</style>`);
  }
  return out;
}

// 门禁页先预取本地脚本，解锁后动画立刻开始
function localScriptPreloads(html) {
  const tags = html.match(/<script\b[^>]*src=["'][^"']+["'][^>]*>/gi) || [];
  const links = [];
  for (const tag of tags) {
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    if (/^(https?:)?\/\//i.test(src)) continue;
    links.push(`<link rel="preload" as="script" href="${src}">`);
  }
  return links.join('\n');
}

// 把图片换成 data URI：照片、Logo 一并进入密文，仓库里不再有可直连的图片
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function readAsset(ref) {
  const clean = ref.split('?')[0].split('#')[0];
  const webp = clean.replace(/\.(png|jpe?g)$/i, '.webp');
  // 有预转换的 webp 就优先用它，体积约为原 png 的五分之一
  for (const candidate of [webp, clean]) {
    try {
      return { buffer: await readFile(join(SRC_DIR, candidate)), path: candidate };
    } catch {}
  }
  return null;
}

async function inlineImages(html) {
  const pattern = /(<img\b[^>]*\bsrc=")([^"]+)(")/gi;
  let out = html;

  for (const match of html.match(pattern) || []) {
    const ref = match.match(/\bsrc="([^"]+)"/i)[1];
    if (/^(https?:|data:)/i.test(ref)) continue;

    const asset = await readAsset(ref);
    if (!asset) {
      console.warn(`警告: 找不到图片 ${ref}，保持原引用`);
      continue;
    }

    const ext = asset.path.slice(asset.path.lastIndexOf('.')).toLowerCase();
    const uri = ext === '.svg'
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.buffer.toString('utf8'))}`
      : `data:${MIME[ext] || 'application/octet-stream'};base64,${asset.buffer.toString('base64')}`;

    out = out.replace(match, () => match.replace(ref, uri));
  }
  return out;
}

// 内嵌字体：可变字重 300–700，只保留页面实际用到的字，约 200KB
async function fontFaceCss() {
  try {
    const woff = await readFile(join(SRC_DIR, 'assets', 'source-han-sans-sc-subset.woff2'));
    return `
@font-face{font-family:"Deck CJK";src:url(data:font/woff2;base64,${woff.toString('base64')}) format("woff2");font-weight:300 700;font-style:normal;font-display:swap;}
/* 内嵌思源黑体优先，统一各平台排版。 */
:root{font-family:"Deck CJK","PingFang SC","Segoe UI",sans-serif;}
/* 正文与标题保持自然字距，避免汉字收紧或过度拉开。 */
.slide h1,.slide h2{letter-spacing:0;}
`;
  } catch {
    console.warn('警告: 没有找到子集字体文件，继续使用系统字体栈');
    return '';
  }
}

const preloads = '';
let fontCss;
if(process.env.OFFLINE_OUTPUT)fontCss=await fontFaceCss();
else fontCss='@font-face{font-family:"Deck CJK";src:url(assets/source-han-sans-sc-subset.woff2) format("woff2");font-weight:300 700;font-display:swap;}';

plaintext = await inlineLocalStyles(plaintext);
if (fontCss) plaintext = plaintext.replace('</head>', `<style>${fontCss}</style>\n</head>`);
if(process.env.OFFLINE_OUTPUT)plaintext = await inlineImages(plaintext);
else{
 const portrait=await readFile(join(SRC_DIR,'assets/portrait.webp'));
 plaintext=plaintext.replace(/src="assets\/portrait.png"/g,()=>`src="data:image/webp;base64,${portrait.toString('base64')}"`);
 const refs=[...plaintext.matchAll(/<img\b[^>]*src="(assets\/[^"]+)"/gi)].map(match=>match[1]);
 for(const ref of new Set(refs)){const asset=await readAsset(ref);if(!asset)throw Error('Missing public asset: '+ref);plaintext=plaintext.replaceAll('src="'+ref+'"','src="'+asset.path+'"');}
}


const script=await readFile(join(here,'deck.js'),'utf8');
plaintext=plaintext.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/i,'').replace('</body>',()=>'<script>'+script+'</script></body>');
plaintext=plaintext.replace('<html lang="zh-CN">','<html lang="zh-CN" style="background:#000;color:#fff">');
if(process.env.OFFLINE_OUTPUT)await writeFile(process.env.OFFLINE_OUTPUT,plaintext,'utf8');
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(normalize(password), salt, ITERATIONS, 32, 'sha256');

const cipher = createCipheriv('aes-256-gcm', key, iv);
const compressed=gzipSync(Buffer.from(plaintext,'utf8'),{level:9});
const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
const tag = cipher.getAuthTag();

// WebCrypto 的 AES-GCM 约定密文尾部带 16 字节认证标签
const payload = Buffer.concat([Buffer.from('MTP4'),salt,iv,ciphertext,tag]);
const version=createHash('sha256').update(payload).digest('hex').slice(0,12);
const gzipDecoder=await readFile(join(SRC_DIR,'gzip-fallback.js'),'utf8');
const gateRuntime=(await readFile(join(here,'gate-runtime.js'),'utf8')).replace('__SIZE__',String(payload.length)).replace('__VERSION__',version);

// 门禁页与密文分离：换密码只动 site.enc，浏览器缓存不会挡住更新
const shell = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<title>受保护页面</title>
${preloads}
<link rel="preload" as="font" type="font/woff2" href="assets/source-han-sans-sc-subset.woff2" crossorigin fetchpriority="low">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%23000'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%23d4b46a'/%3E%3C/svg%3E">
<style>
  :root {
    color-scheme: dark;
    --fg: #fff;
    --muted: #a1a1a6;
    --gold: #d4b46a;
    --line: rgba(255, 255, 255, .16);
    --glass: rgba(255, 255, 255, .06);
    --ease: cubic-bezier(.22, 1, .36, 1);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: #000;
    color: var(--fg);
    display: grid;
    place-items: center;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* 与 deck 同一套环境光 */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(44% 50% at 13% 84%, rgba(212, 180, 106, .10), transparent 72%),
      radial-gradient(40% 46% at 80% 10%, rgba(72, 122, 255, .11), transparent 70%),
      radial-gradient(52% 58% at 52% 108%, rgba(140, 110, 220, .07), transparent 74%);
  }
  body::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to bottom, rgba(255, 255, 255, .05), rgba(255, 255, 255, 0) 15%),
      radial-gradient(132% 112% at 50% 46%, rgba(255, 255, 255, 0) 40%, rgba(0, 0, 0, .55) 100%),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)' opacity='.055'/%3E%3C/svg%3E");
  }
  form {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 404px;
    padding: 44px 40px 34px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--glass);
    backdrop-filter: blur(26px) saturate(120%);
    -webkit-backdrop-filter: blur(26px) saturate(120%);
    box-shadow: 0 40px 90px -50px rgba(0, 0, 0, .95);
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 22px;
    font-size: 11.5px;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .eyebrow::before {
    content: '';
    width: 26px;
    height: 1px;
    background: currentColor;
    opacity: .55;
    flex: none;
  }
  h1 {
    margin: 0 0 14px;
    font-size: clamp(25px, 4vw, 33px);
    letter-spacing: -.8px;
    line-height: 1.3;
    font-weight: 500;
    background: linear-gradient(178deg, #fff 34%, #b9b9c4 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hint {
    margin: 0 0 28px;
    font-size: 13.5px;
    line-height: 1.85;
    color: var(--muted);
  }
  .field { position: relative; margin-bottom: 16px; }
  input {
    width: 100%;
    font: inherit;
    font-size: 15px;
    padding: 15px 66px 15px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(0, 0, 0, .38);
    color: var(--fg);
    transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
  }
  input::placeholder { color: rgba(255, 255, 255, .3); }
  input:focus {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(212, 180, 106, .16);
  }
  .toggle {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    font: inherit;
    font-size: 12px;
    letter-spacing: .08em;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: color .2s var(--ease);
  }
  .toggle:hover { color: var(--gold); }
  .gate-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    padding: 15px 18px;
    border: 1px solid rgba(212, 180, 106, .5);
    border-radius: 12px;
    background: var(--gold);
    color: #0a0a0a;
    cursor: pointer;
    transition: transform .25s var(--ease), box-shadow .25s var(--ease), opacity .2s var(--ease);
  }
  .gate-btn span { transition: transform .3s var(--ease); }
  .gate-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 30px -16px rgba(212, 180, 106, .85);
  }
  .gate-btn:hover span { transform: translateX(4px); }
  .gate-btn:disabled {
    opacity: .5;
    cursor: progress;
    transform: none;
    box-shadow: none;
  }
  .gate-btn:focus-visible, .toggle:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 4px;
  }

  .loading-status{margin-top:24px;padding-top:20px;border-top:1px solid var(--line);}
  .load-head{display:flex;align-items:center;gap:10px;font-size:13px;line-height:1.6;}
  .load-head #load-percent{margin-left:auto;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}
  #load-retry{font:inherit;font-size:12px;color:var(--gold);border:0;background:none;cursor:pointer;padding:4px 0 4px 8px;}
  .loader{width:14px;height:14px;flex:none;border:1.5px solid rgba(255,255,255,.16);border-top-color:var(--gold);border-radius:50%;animation:loading-spin .9s linear infinite;}
  [data-state=ready] .loader{animation:none;border-color:var(--gold);background:var(--gold);width:7px;height:7px;margin:0 3.5px;}
  [data-state=error] .loader{animation:none;border-color:var(--muted);}
  .load-track{height:3px;margin-top:13px;overflow:hidden;background:rgba(255,255,255,.1);border-radius:3px;}
  .load-track>span{display:block;width:0;height:100%;background:var(--gold);transition:width .18s linear;}
  .load-track.indeterminate>span{width:35%!important;animation:loading-sweep 1.3s ease-in-out infinite;}
  .load-steps{display:flex;justify-content:space-between;gap:8px;margin-top:11px;font-size:10.5px;letter-spacing:.02em;color:var(--muted);}
  .load-steps [data-state=active]{color:var(--fg);}.load-steps [data-state=done]{color:var(--gold);}
  @keyframes loading-spin{to{transform:rotate(360deg)}}
  @keyframes loading-sweep{from{transform:translateX(-110%)}to{transform:translateX(390%)}}
  @media(prefers-reduced-motion:reduce){.loader,.load-track.indeterminate>span{animation:none}.load-track>span{transition:none}}
  .msg {
    min-height: 20px;
    margin: 14px 0 0;
    font-size: 13px;
    line-height: 1.7;
    color: var(--gold);
  }
  @media (max-width: 430px) {
    form { padding: 32px 24px 26px; border-radius: 16px; }
    h1 { font-size: 25px; }
  }
</style>
</head>
<body>
<form id="gate" autocomplete="off">
  <p class="eyebrow">Private access</p>
  <h1>这个页面需要密码</h1>
  <p class="hint">内容已加密保存，输入密码后在本地解密显示。密码不区分大小写。</p>
  <div class="field">
    <input id="pw" type="password" placeholder="访问密码" aria-label="访问密码" autofocus required>
    <button type="button" id="toggle" class="toggle" aria-pressed="false" aria-label="显示密码">显示</button>
  </div>
  <button id="go" class="gate-btn" type="submit">打开 <span>→</span></button>
  <div class="loading-status" id="loading" role="status" aria-live="polite" aria-busy="true" data-state="loading">
    <div class="load-head"><span class="loader" aria-hidden="true"></span><span id="load-title">正在加载内容</span><span id="load-percent">0%</span><button id="load-retry" type="button" aria-label="重新加载内容" hidden>重试</button></div>
    <div class="load-track" id="load-track" role="progressbar" aria-label="加载内容" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="load-fill"></span></div>
    <div class="load-steps"><span data-load-step="download" data-state="active">加载内容</span><span data-load-step="decrypt">安全解锁</span><span data-load-step="prepare">准备展示</span></div>
  </div>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
</form>

<script>${gzipDecoder}</script>
<script>${gateRuntime}</script>
</body>
</html>
`;

await writeFile(SHELL, shell, 'utf8');
await writeFile(PAYLOAD_FILE, payload, 'utf8');

console.log(`门禁页 index.html ${Buffer.byteLength(shell)} 字节`);
console.log(`密文 site-v3.3.1.enc ${payload.length} 字节`);
console.log(`PBKDF2 ${ITERATIONS} 次迭代，密码不区分大小写`);
