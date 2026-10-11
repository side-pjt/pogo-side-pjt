'use strict';

/* ------------------------------------------------------------------
   팀 조합 유형 — ABB / ABA / ABC / XAB

   A, B, C는 타입 이름이 아니라 '역할과 약점 구조'를 구분하는 기호다.
   같은 글자 = 비슷한 역할이거나 비슷한 약점을 가진 포켓몬.

   예시 포켓몬은 설명용이다. 메타는 계속 바뀌므로 순위는 현재 데이터 기준으로
   그때그때 다시 찍는다 (아래 byId 가 data.js 를 참조한다).
------------------------------------------------------------------ */

const ROLE = {
  A: { name: '공격형', note: '압박 · 딜 담당' },
  B: { name: '보완형', note: '약점 커버 · 전환' },
  C: { name: '특수형', note: '특정 역할 · 테크' },
  X: { name: '유동형', note: '상황 대응' },
};

const ARCHETYPES = [
  {
    code: 'ABB',
    slots: ['A', 'B', 'B'],
    headline: '뒤 두 마리가 비슷한 역할',
    how: 'B의 카운터를 먼저 유도해서 빼낸 뒤, 남은 B로 마무리한다.',
    members: ['stunfisk_galarian', 'ninetales_alolan', 'clefable'],
    pro: '운영이 강력하고 압박감이 크다',
    con: '공통 카운터를 못 처리하면 힘들다',
  },
  {
    code: 'ABA',
    slots: ['A', 'B', 'A'],
    headline: '앞과 뒤가 비슷한 역할',
    how: '리드 A로 압박하고, 가운데 B로 약점을 보완한 뒤, 마지막 A로 다시 압박한다.',
    members: ['altaria', 'lanturn', 'noctowl'],
    pro: '특정 매치업을 반복해서 압박할 수 있다',
    con: 'A의 공통 약점이 드러나면 흔들린다',
  },
  {
    code: 'ABC',
    slots: ['A', 'B', 'C'],
    headline: '세 마리가 모두 다른 역할',
    how: '넓은 대응 범위로 안정적으로 싸우는 밸런스형.',
    members: ['swampert', 'noctowl', 'sableye'],
    pro: '안정적이고 초보자도 이해하기 쉽다',
    con: '아주 날카로운 몰아치기 패턴은 약할 수 있다',
  },
  {
    code: 'XAB',
    slots: ['X', 'A', 'B'],
    headline: '첫 자리가 유동적인 응용 조합',
    how: '선봉 X로 판을 보고, A와 B가 상성을 이어받아 유연하게 운영한다.',
    members: ['gliscor', 'altaria', 'lanturn'],
    pro: '상황 대응력이 높고 응용 폭이 넓다',
    con: 'X 역할 이해도가 낮으면 운영 난도가 올라간다',
  },
];

const byId = id => DATA.find(p => p.id === id);

function memberCard(id, role) {
  const p = byId(id);
  if (!p) return '';
  return `<figure class="tm">
    <img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">
    <figcaption>
      <span class="tm-name">${esc(p.ko)}</span>
      <span class="role r-${role}">${role}</span>
      <span class="tm-rank">${rankText(p)}</span>
    </figcaption>
  </figure>`;
}

function archetypeCard(a) {
  const missing = a.members.filter(id => !byId(id));
  return `<article class="arch" data-code="${a.code}">
    <header class="arch-head">
      <h3>${a.code}</h3>
      <span class="arch-slots">${a.slots.map(s => `<i class="role r-${s}">${s}</i>`).join('')}</span>
      <span class="arch-headline">${esc(a.headline)}</span>
    </header>
    <p class="arch-how"><b>운영 핵심</b> ${esc(a.how)}</p>
    <div class="arch-members">${a.members.map((id, i) => memberCard(id, a.slots[i])).join('')}</div>
    ${missing.length ? `<p class="note">※ 예시 ${missing.length}종이 현재 데이터에 없어 표시하지 못했습니다.</p>` : ''}
    <div class="arch-pc">
      <div class="pro"><b>장점</b> ${esc(a.pro)}</div>
      <div class="con"><b>주의</b> ${esc(a.con)}</div>
    </div>
  </article>`;
}

function buildRoles() {
  document.getElementById('roles').innerHTML = Object.entries(ROLE).map(([k, v]) =>
    `<div class="role-item">
      <span class="role r-${k}">${k}</span>
      <div><b>${v.name}</b><small>${v.note}</small></div>
    </div>`).join('');
}

buildRoles();
document.getElementById('archetypes').innerHTML = ARCHETYPES.map(archetypeCard).join('');

// 메가·원시 포켓몬 전체 (메가 에디션 순위순)
document.getElementById('mega-list').innerHTML = DATA.filter(p => p.mega)
  .sort((a, b) => a.rank - b.rank)
  .map(p => `<figure class="tm">
    <img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">
    <figcaption>
      <span class="tm-name">${esc(p.ko)}</span>
      <span class="tm-rank">${rankText(p)}</span>
    </figcaption>
  </figure>`).join('');
