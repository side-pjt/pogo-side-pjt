'use strict';

/* 두 페이지(CCT·CMP)가 같이 쓰는 것들 — 데이터, 검색, 포켓몬 선택 콤보박스 */

/* 포맷(리그·컵)별 순위·추천 기술·기본 개체값 — data/formats/<key>.js 가 FORMAT_DATA[key] 에 넣는다 */
const FORMAT_DATA = window.FORMAT_DATA || {};

/* data.js 에는 모든 리그·컵의 종이 들어 있고 순위는 없다.
   화면은 아직 슈퍼리그 순위 기준이라, 그 순위가 있는 종만 순위 순으로 쓴다.
   메가·원시 폼은 표준 슈퍼리그 랭킹이 아니라 PvPoke 메가 에디션 랭킹의 순위다 */
const DATA = (function () {
  const order = key => new Map(((FORMAT_DATA[key] || {}).ranking || []).map((id, i) => [id, i + 1]));
  const great = order('great'), mega = order('mega-1500');
  const megaIvs = (FORMAT_DATA['mega-1500'] || {}).defaultIvs || {};
  return (window.POKEMON || [])
    .filter(p => (p.mega ? mega : great).has(p.id))
    .map(p => {
      p.rank = (p.mega ? mega : great).get(p.id);
      if (p.mega && megaIvs[p.id]) p.pvIv = megaIvs[p.id];
      return p;
    })
    .sort((a, b) => a.mega - b.mega || a.rank - b.rank);
})();
const CPM = window.CPM || [];

const norm = s => (s || '').toLowerCase().replace(/\s+/g, '');

function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* 주소창 ?키=값 — 고른 포켓몬을 주소에 남겨서 링크로 다시 열 수 있게 한다 */
function urlGet(key) {
  try { return new URLSearchParams(location.search).get(key); } catch (e) { return null; }
}
function urlSet(key, val) {
  try {
    const q = new URLSearchParams(location.search);
    if (val) q.set(key, val); else q.delete(key);
    const s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  } catch (e) { /* file:// 등 */ }
}
function monFromUrl(key) {
  const id = urlGet(key);
  return id ? DATA.find(p => p.id === id) || null : null;
}

/* 영문 이름 — 그림자는 data 의 en 에 'Shadow' 가 없어서 붙여준다 */
function enName(p) { return (p.shadow && !/shadow/i.test(p.en) ? 'Shadow ' : '') + p.en; }
/* 한글 이름 뒤에 작고 흐린 영문 이름 */
function nameHtml(p) { return `${esc(p.ko)}<small class="en">${esc(enName(p))}</small>`; }

function byRank(r) { return DATA.find(p => !p.mega && p.rank === r); }
/* 메가·원시끼리만 매긴 순위. 메가 에디션 전체 순위 순서대로 1, 2, 3… */
const MEGA_ORDER = new Map(DATA.filter(p => p.mega).sort((a, b) => a.rank - b.rank).map((p, i) => [p.id, i + 1]));
function rankText(p) {
  return p.mega ? `메가 에디션 ${p.rank}위 (메가 중 ${MEGA_ORDER.get(p.id)}위)` : `${p.rank}위`;
}

/* 선택 목록에 보여줄 최대 개수 (순위 순). 아래로 스크롤하면 더 나온다 */
const LIST_LIMIT = 300;

function search(q, limit) {
  const n = norm(q);
  if (!n) return DATA.slice(0, limit);

  const scored = [];
  for (const p of DATA) {
    const ko = norm(p.ko), en = norm(p.en), id = norm(p.id);
    let s = -1;
    if (ko === n || en === n) s = 0;
    else if (ko.startsWith(n) || en.startsWith(n)) s = 1;
    else if (ko.includes(n) || en.includes(n) || id.includes(n)) s = 2;
    if (s >= 0) scored.push([s, p.rank + (p.mega ? 5000 : 0), p]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(x => x[2]);
}

/* 검색 콤보박스. 고른 뒤에 무엇을 할지는 페이지마다 달라서 onPick으로 넘긴다. */
function setupSearch(root, onPick) {
  const input = root.querySelector('.search');
  const list = root.querySelector('.results');
  let cursor = -1, shown = [];
  const listId = list.id || `search-list-${setupSearch.nextId++}`;
  list.id = listId;
  list.setAttribute('role', 'listbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-expanded', 'false');

  function close() {
    list.hidden = true;
    cursor = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  // 고른 뒤 포커스를 풀어야 같은 입력창을 다시 눌렀을 때 focus가 다시 발생하고(모바일은 키보드도 내려감) 목록이 열린다
  function pick(p) { input.value = ''; close(); input.blur(); onPick(p); }

  function renderList(items) {
    shown = items;
    list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.textContent = '검색 결과 없음';
      list.append(li);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }
    items.forEach((p, i) => {
      const li = document.createElement('li');
      li.id = `${listId}-option-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === cursor));
      li.innerHTML = `<img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">` +
        `<span class="r-name"></span><span class="r-sub">${rankText(p)}</span>`;
      li.querySelector('.r-name').innerHTML = nameHtml(p);
      li.addEventListener('mousedown', e => { e.preventDefault(); pick(p); });
      list.append(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function moveCursor(d) {
    if (list.hidden || !shown.length) return;
    cursor = (cursor + d + shown.length) % shown.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === cursor)));
    input.setAttribute('aria-activedescendant', list.children[cursor].id);
    list.children[cursor].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => renderList(search(input.value, LIST_LIMIT)));
  input.addEventListener('focus', () => renderList(search(input.value, LIST_LIMIT)));
  input.addEventListener('click', () => { if (list.hidden) renderList(search(input.value, LIST_LIMIT)); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
    else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault(); pick(shown[cursor]);
    } else if (e.key === 'Escape') close();
  });
}
setupSearch.nextId = 1;

/* 상단 네비게이션의 현재 페이지 표시 */
(function markNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
})();
