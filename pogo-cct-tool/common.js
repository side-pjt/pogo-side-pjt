'use strict';

/* 두 페이지(CCT·CMP)가 같이 쓰는 것들 — 데이터, 검색, 포켓몬 선택 콤보박스 */

const DATA = (window.POKEMON || []).slice();
const CPM = window.CPM || [];

const norm = s => (s || '').toLowerCase().replace(/\s+/g, '');

function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function byRank(r) { return DATA.find(p => p.rank === r); }

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
    if (s >= 0) scored.push([s, p.rank, p]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(x => x[2]);
}

/* 검색 콤보박스. 고른 뒤에 무엇을 할지는 페이지마다 달라서 onPick으로 넘긴다. */
function setupSearch(root, onPick) {
  const input = root.querySelector('.search');
  const list = root.querySelector('.results');
  let cursor = -1, shown = [];

  function close() { list.hidden = true; cursor = -1; }

  function renderList(items) {
    shown = items;
    list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '검색 결과 없음';
      list.append(li);
      list.hidden = false;
      return;
    }
    items.forEach((p, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === cursor));
      li.innerHTML = `<img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">` +
        `<span class="r-name"></span><span class="r-sub">${p.rank}위</span>`;
      li.querySelector('.r-name').textContent = p.ko;
      li.addEventListener('mousedown', e => { e.preventDefault(); input.value = ''; close(); onPick(p); });
      list.append(li);
    });
    list.hidden = false;
  }

  function moveCursor(d) {
    if (list.hidden || !shown.length) return;
    cursor = (cursor + d + shown.length) % shown.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === cursor)));
    list.children[cursor].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => renderList(search(input.value, 40)));
  input.addEventListener('focus', () => renderList(search(input.value, 40)));
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
    else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault(); input.value = ''; close(); onPick(shown[cursor]);
    } else if (e.key === 'Escape') close();
  });
}

/* 상단 네비게이션의 현재 페이지 표시 */
(function markNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
})();
