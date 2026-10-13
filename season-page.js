'use strict';

/* ------------------------------------------------------------------
   시즌 일정 페이지 — data/seasons.js 를 season.js 로 판정해 그린다.
   이번 주·다음 주 포맷은 season.html 이 순위 파일을 미리 읽어 두어서 상위 10종을 보여 준다.
------------------------------------------------------------------ */

const SN = Season.at();
const SPECIES = new Map((window.POKEMON || []).map(p => [p.id, p]));

function seasonOf() {
  return SN.season || SN.nextSeason || Season.list[Season.list.length - 1] || null;
}

function rulesOf(season, key) {
  const f = Format.byKey(key);
  if ((season.rules || {})[key]) return season.rules[key];
  if (!f) return '';
  return f.cp >= 10000 ? 'CP 제한 없음' : `CP ${f.cp.toLocaleString('ko-KR')} 이하`;
}

/* 포맷 하나 — 이름, 출전 조건, 상위 10종, 바로가기 */
function cupCard(season, e) {
  const top = ((FORMAT_DATA[e.key] || {}).ranking || []).map(id => SPECIES.get(id)).filter(Boolean).slice(0, 10);
  const body = e.ready
    ? `<div class="sn-top">${top.map((p, i) => `<figure title="${esc(p.ko)}">
          <img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy"><figcaption>${i + 1}. ${esc(p.ko)}</figcaption></figure>`).join('')}</div>
       <div class="sn-go">
         <button type="button" class="sn-btn" data-key="${esc(e.key)}">이 리그로 보기</button>
         <a class="sn-btn ghost" href="battle.html?f=${encodeURIComponent(e.key)}">배틀 시뮬레이터</a>
       </div>`
    : '<p class="note">PvPoke 순위가 아직 올라오지 않았습니다. 올라오면 데이터 갱신 때 자동으로 들어옵니다.</p>';
  return `<article class="sn-cup${e.ready ? '' : ' waiting'}">
    <h3>${esc(e.ko)}${e.key === FORMAT.key ? ' <span class="pill-note">보는 중</span>' : ''}</h3>
    <p class="sn-rule">${esc(rulesOf(season, e.key))}</p>
    ${body}
  </article>`;
}

function weekRange(w, withTime) {
  return `${Season.kstDate(w.start, withTime)} – ${Season.kstDate(w.end, withTime)}`;
}

function paint() {
  const season = seasonOf();
  const out = document.getElementById('season-out');
  if (!season) {
    out.innerHTML = '<section class="panel"><p>등록된 시즌 일정이 없습니다.</p></section>';
    return;
  }
  document.getElementById('season-name').textContent = season.ko;
  document.getElementById('season-period').textContent = `${Season.kstDate(season.start)} – ${Season.kstDate(season.end)} (한국시간)`;

  const parts = [];
  if (SN.stale)
    parts.push('<section class="panel sn-alert"><p><b>다음 시즌 일정이 아직 등록되지 않았습니다.</b> 아래는 지난 시즌 일정입니다.</p></section>');

  /* 끝난 주는 빼고 이번 주부터 보여 준다. 시즌이 통째로 끝났을 때(stale)만 전부 남긴다 */
  const weeks = SN.stale ? season.weeks : season.weeks.filter(w => Season.weekState(w) !== 'past');
  const rows = weeks.map(w => {
    const state = Season.weekState(w);
    const chips = w.formats.map(Season.entry).map(e => e.ready
      ? `<button type="button" class="sn-chip" data-key="${esc(e.key)}">${esc(e.ko)}</button>`
      : `<span class="sn-chip off" title="순위 준비 중">${esc(e.ko)}</span>`).join('');
    return `<tr class="${state}"><th scope="row">${weekRange(w)}${state === 'now' ? ' <span class="pill-note">이번 주</span>' : ''}</th><td>${chips}</td></tr>`;
  }).join('');
  parts.push(`<section class="panel">
    <h2>주차별 일정</h2>
    <p class="note">날짜는 한국시간입니다. 매주 수요일 오전 5시(11/7부터 오전 6시)에 바뀝니다. 누르면 그 리그·컵으로 봅니다.</p>
    <div class="table-scroll" tabindex="0" aria-label="주차별 일정표"><table class="sn-table"><tbody>${rows}</tbody></table></div>
  </section>`);

  if (SN.live.length) {
    const left = Season.daysLeft(SN.endsAt);
    parts.push(`<section class="panel">
      <h2>이번 주 <span class="pill-note">${left ? `D-${left}` : 'D-day'} · ${SN.current.map(w => weekRange(w, true)).join(', ')}</span></h2>
      <div class="sn-cups">${SN.live.map(e => cupCard(season, e)).join('')}</div>
    </section>`);
  }
  const next = SN.next || (SN.nextSeason && SN.nextSeason.weeks[0]);
  if (next) {
    parts.push(`<section class="panel">
      <h2>다음 주 <span class="pill-note">${weekRange(next, true)}</span></h2>
      <div class="sn-cups">${next.formats.map(Season.entry).map(e => cupCard(season, e)).join('')}</div>
    </section>`);
  }

  parts.push(`<section class="panel">
    <h2>이번 시즌 알아둘 것</h2>
    <ul class="tips">${(season.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    <p class="note">출처 <a href="${esc(season.source)}" target="_blank" rel="noopener">포켓몬 GO 공식 공지</a> · 확인일 ${esc(season.verifiedAt)}.
      일정은 바뀔 수 있으니 게임 안 공지를 함께 확인하세요.</p>
  </section>`);

  out.innerHTML = parts.join('');
}

paint();
document.getElementById('season-out').addEventListener('click', e => {
  const b = e.target.closest('[data-key]');
  if (b) Format.go(b.dataset.key);
});
