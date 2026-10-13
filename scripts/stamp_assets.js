'use strict';

/* HTML 이 읽는 로컬 CSS·JS 주소 끝에 파일 내용 해시(?v=)를 붙인다.
   GitHub Pages 는 파일을 10분 캐시하게 해서, 주소가 그대로면 고친 CSS·JS 대신 예전 것이 섞여 뜬다.
   내용이 바뀌면 주소가 바뀌니 바로 새로 받는다. 해시는 줄바꿈(\r)을 빼고 계산해 윈도우·CI 가 같다.
     node scripts/stamp_assets.js          고쳐 쓴다
     node scripts/stamp_assets.js --check  고칠 것이 있으면 목록을 찍고 1 로 끝난다 (테스트용) */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const REF = /\b(src|href)="([\w./-]+\.(?:js|css))(?:\?v=[^"]*)?"/g;

const hashes = new Map();
function hashOf(file) {
  if (!hashes.has(file)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r/g, '');
    hashes.set(file, crypto.createHash('sha1').update(text).digest('hex').slice(0, 8));
  }
  return hashes.get(file);
}

const stale = [];
for (const name of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const file = path.join(root, name);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(REF, (all, attr, ref) =>
    fs.existsSync(path.join(root, ref)) ? `${attr}="${ref}?v=${hashOf(ref)}"` : all);
  if (after === before) continue;
  stale.push(name);
  if (!check) fs.writeFileSync(file, after);
}

if (check && stale.length) {
  console.error(`자산 버전이 낡았다: ${stale.join(', ')} — node scripts/stamp_assets.js 를 돌려라`);
  process.exit(1);
}
console.log(stale.length ? `고침: ${stale.join(', ')}` : '자산 버전 최신');
