import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const password = process.argv[2] || process.env.SITE_PASSWORD;

if (!password || password.length < 6) {
  console.error('用法: node build.mjs <密码>   或   SITE_PASSWORD=xxx node build.mjs');
  console.error('密码至少 6 位。');
  process.exit(1);
}

const ITERATIONS = 250000;
const SOURCE = join(here, 'src', 'index.html');
const OUTPUT = join(here, 'index.html');

const plaintext = await readFile(SOURCE, 'utf8');

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');

const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

// WebCrypto 的 AES-GCM 约定密文尾部带 16 字节认证标签
const payload = Buffer.concat([salt, iv, ciphertext, tag]).toString('base64');

const shell = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#faf8f4">
<title>受保护页面</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%23faf8f4'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%231a1714'/%3E%3C/svg%3E">
<style>
  :root {
    --paper: #faf8f4;
    --ink: #1a1714;
    --muted: #6e6862;
    --rule: #e2dbd1;
    --accent: #a8492b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    padding: 24px;
  }
  form {
    width: 100%;
    max-width: 340px;
    border-top: 1px solid var(--ink);
    padding-top: 28px;
  }
  .label {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--accent);
    margin: 0 0 18px;
  }
  h1 {
    font-family: Georgia, "Songti SC", "Source Han Serif SC", serif;
    font-size: 23px;
    font-weight: 500;
    letter-spacing: 0.04em;
    margin: 0 0 10px;
  }
  p.hint {
    font-size: 13.5px;
    line-height: 1.75;
    color: var(--muted);
    margin: 0 0 24px;
  }
  input {
    width: 100%;
    font: inherit;
    font-size: 15px;
    padding: 11px 13px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: #fffdfa;
    color: var(--ink);
    margin-bottom: 10px;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(168, 73, 43, 0.12);
  }
  button {
    width: 100%;
    font: inherit;
    font-size: 14px;
    padding: 11px 13px;
    border: 1px solid var(--ink);
    border-radius: 6px;
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
    transition: opacity 0.16s ease;
  }
  button:hover { opacity: 0.86; }
  button:disabled { opacity: 0.5; cursor: progress; }
  .msg {
    font-size: 13px;
    color: var(--accent);
    min-height: 20px;
    margin: 12px 0 0;
  }
</style>
</head>
<body>
<form id="gate" autocomplete="off">
  <p class="label">PRIVATE</p>
  <h1>这个页面需要密码</h1>
  <p class="hint">内容已加密保存，输入密码后在本地解密显示。</p>
  <input id="pw" type="password" placeholder="访问密码" aria-label="访问密码" autofocus required>
  <button id="go" type="submit">打开</button>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
</form>

<script>
const PAYLOAD = "${payload}";
const ITERATIONS = ${ITERATIONS};

function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function unlock(password) {
  const raw = fromB64(PAYLOAD);
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const data = raw.slice(28);

  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
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

const form = document.getElementById('gate');
const input = document.getElementById('pw');
const button = document.getElementById('go');
const msg = document.getElementById('msg');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input.value) return;
  button.disabled = true;
  msg.textContent = '正在解密…';
  try {
    const html = await unlock(input.value);
    document.open();
    document.write(html);
    document.close();
  } catch {
    msg.textContent = '密码不对，再试一次。';
    button.disabled = false;
    input.select();
  }
});
</script>
</body>
</html>
`;

await writeFile(OUTPUT, shell, 'utf8');
console.log(`已生成加密页面 index.html（${Buffer.byteLength(shell)} 字节，PBKDF2 ${ITERATIONS} 次迭代）`);
