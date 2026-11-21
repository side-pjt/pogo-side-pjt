'use strict';

/* ------------------------------------------------------------------
   밸런스 패치 페이지 — data/patch-notes.js 를 그린다.
   기술 변경은 '위력 55 → 60' 같은 줄을 증가(초록)·감소(주황)로 칠하고,
   새로 배우는 기술은 기술별로 묶어 포켓몬 스프라이트와 함께 보여 준다.
------------------------------------------------------------------ */

const PATCH_SPECIES = new Map((window.POKEMON || []).map(p => [p.id, p]));

/* 변경 문구가 좋아졌는지 나빠졌는지 — 위력은 숫자 비교, 에너지는 '소모'가 줄면 좋아짐, '획득'이 줄면 나빠짐 */
function changeTone(text) {
  const m = text.match(/(\d+)\s*→\s*(\d+)/);
  if (m) return Number(m[2]) > Number(m[1]) ? 'up' : 'down';
  if (/소모 감소|획득량 증가/.test(text)) return 'up';
  if (/소모 증가|획득량 감소/.test(text)) return 'down';
  return '';
}

function moveCard(m) {
  const lines = m.changes.map(c => `<li class="pt-${changeTone(c)}">${esc(c)}</li>`).join('');
  return `<article class="pt-move ty ty-${m.type}">
    <h3><span class="pt-dot" aria-hidden="true"></span>${esc(m.ko)}${m.kind === 'fast' ? ' <span class="pt-kind">노말어택</span>' : ''}</h3>
    <p class="pt-en">${esc(m.en)}</p>
    <ul>${lines}</ul>
  </article>`;
}

/* 같은 기술(이름+종류)을 배우는 포켓몬끼리 묶는다 */
function learnGroups(list) {
  const groups = new Map();
  for (const [id, ko, move, kind, type] of list) {
    const key = move + '|' + kind;
    if (!groups.has(key)) groups.set(key, { move, kind, type, mons: [] });
    groups.get(key).mons.push({ id, ko });
  }
  return [...groups.values()];
}

function learnCard(g) {
  const mons = g.mons.map(({ id, ko }) => {
    const p = PATCH_SPECIES.get(id);
    const img = p ? `<img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">` : '';
    return `<figure>${img}<figcaption>${esc(ko)}</figcaption></figure>`;
  }).join('');
  return `<article class="pt-learn ty ty-${g.type}">
    <h3><span class="pt-dot" aria-hidden="true"></span>${esc(g.move)} <span class="pt-kind">${g.kind === 'fast' ? '노말어택' : '스페셜어택'}</span></h3>
    <div class="pt-mons">${mons}</div>
  </article>`;
}

function paint() {
  const out = document.getElementById('patch-out');
  const patch = (window.PATCHES || [])[0];
  if (!patch) { out.innerHTML = '<section class="panel"><p>등록된 패치 내역이 없습니다.</p></section>'; return; }
  out.innerHTML = `
    <section class="panel">
      <h2>${esc(patch.title)}</h2>
      <p class="note">${esc(patch.note)} <span class="pt-up">초록</span>은 좋아진 쪽, <span class="pt-down">주황</span>은 나빠진 쪽입니다.</p>
    </section>
    <section class="panel">
      <h2>기술 변경 <span class="pt-count">${patch.moveChanges.length}</span></h2>
      <div class="pt-grid">${patch.moveChanges.map(moveCard).join('')}</div>
    </section>
    <section class="panel">
      <h2>새로 배우는 기술 <span class="pt-count">${patch.learnsets.length}</span></h2>
      <div class="pt-grid wide">${learnGroups(patch.learnsets).map(learnCard).join('')}</div>
    </section>`;
}

paint();
