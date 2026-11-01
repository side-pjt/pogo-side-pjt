'use strict';

/* 앱 설치용 서비스 워커 — 한 번 열어 본 화면은 인터넷이 없어도 열린다.
   화면·스크립트·데이터는 '네트워크 먼저'(없을 때만 저장본)라서 매일 갱신되는 순위가 낡은 채로 남지 않는다.
   사진은 '저장본 먼저'(바뀌지 않고 1,500장이 넘는다). 화면 파일을 바꿔도 이 파일은 그대로 두면 된다. */
const PAGES = 'pogo-pages-v1';
const IMAGES = 'pogo-images-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== PAGES && key !== IMAGES) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 구글 폰트 등 바깥 주소는 브라우저에 맡긴다

  if (/\/images\//.test(url.pathname) || /\.(png|webp|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, IMAGES));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // 주소 뒤 ?f=…·?v=… 가 달라도 같은 파일이면 쓴다
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
