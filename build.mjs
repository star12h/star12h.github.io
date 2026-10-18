import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
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
const SOURCE = join(here, 'src', 'index.html');
const SHELL = join(here, 'index.html');
const PAYLOAD_FILE = join(here, 'site.enc');

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
      css = await readFile(join(here, file), 'utf8');
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

const preloads = localScriptPreloads(plaintext);
plaintext = await inlineLocalStyles(plaintext);

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(normalize(password), salt, ITERATIONS, 32, 'sha256');

const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

// WebCrypto 的 AES-GCM 约定密文尾部带 16 字节认证标签
const payload = Buffer.concat([salt, iv, ciphertext, tag]).toString('base64');

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
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
</form>

<script>
const PAYLOAD_URL = 'site.enc';
const ITERATIONS = ${ITERATIONS};

function fromB64(s) {
  const clean = s.replace(/\\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadPayload() {
  const res = await fetch(PAYLOAD_URL + '?v=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('payload ' + res.status);
  return fromB64(await res.text());
}

async function unlock(password, raw) {
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const data = raw.slice(28);

  // 与加密端一致：去空白 + 转小写，所以大小写都能解开
  const normalized = password.trim().toLowerCase();

  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(normalized), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

function preloadImages(html) {
  let srcs = [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    srcs = [...doc.querySelectorAll('img[src]')]
      .map((img) => img.getAttribute('src'))
      .filter((src) => src && src.indexOf('data:') !== 0);
  } catch {
    return Promise.resolve();
  }
  if (!srcs.length) return Promise.resolve();
  const loads = srcs.map((src) => new Promise((resolve) => {
    const probe = new Image();
    probe.onload = probe.onerror = () => resolve();
    probe.src = src;
  }));
  return Promise.race([
    Promise.all(loads),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
}

const form = document.getElementById('gate');
const input = document.getElementById('pw');
const toggle = document.getElementById('toggle');
const button = document.getElementById('go');
const msg = document.getElementById('msg');

toggle.addEventListener('click', () => {
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  toggle.textContent = hidden ? '隐藏' : '显示';
  toggle.setAttribute('aria-pressed', String(hidden));
  input.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input.value) return;
  button.disabled = true;
  msg.textContent = '正在解密…';

  if (!window.crypto || !window.crypto.subtle) {
    msg.textContent = '当前浏览器或网址不支持解密（需要 HTTPS），换个浏览器试试。';
    button.disabled = false;
    return;
  }

  let raw;
  try {
    raw = await loadPayload();
  } catch {
    msg.textContent = '密文文件没加载成功，检查一下网络后重试。';
    button.disabled = false;
    return;
  }

  let html;
  try {
    html = await unlock(input.value, raw);
  } catch {
    msg.textContent = '密码不对，再试一次。';
    button.disabled = false;
    input.select();
    return;
  }

  // 图片先下好再切换文档，避免解密后一块块跳出来
  msg.textContent = '正在准备…';
  await preloadImages(html);

  document.open();
  document.write(html);
  document.close();
});
</script>
</body>
</html>
`;

await writeFile(SHELL, shell, 'utf8');
await writeFile(PAYLOAD_FILE, payload, 'utf8');

console.log(`门禁页 index.html ${Buffer.byteLength(shell)} 字节`);
console.log(`密文 site.enc ${payload.length} 字节（已内联 deck.css）`);
console.log(`PBKDF2 ${ITERATIONS} 次迭代，密码不区分大小写`);
