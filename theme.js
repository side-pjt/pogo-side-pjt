'use strict';

/* 테마 — <head> 에서 바로 읽어서 첫 화면부터 고른 테마로 그린다(깜빡임 방지).
   고른 값은 localStorage 에 남고, 사이드바에 고르는 버튼을 붙인다. */
(function () {
  const KEY = 'pogo-theme';
  /* sw: 미리보기 동그라미 색 [배경, 강조, 보조]. font: 필요한 구글 폰트 (처음 고를 때만 불러온다) */
  /* 첫 번째가 기본 테마 — 저장된 값이 없으면 이걸로 연다 */
  const THEMES = [
    { id: 'ghost',    name: '고스트', desc: '기본 · 보랏빛 어둠 · 네온', sw: ['#0a0613', '#ff3da8', '#3dd4ff'], meta: '#0a0613', font: 'Orbitron:wght@500;700' },
    { id: 'night',    name: '밤',     desc: '남색과 노랑',              sw: ['#0d1220', '#ffd34d', '#5aa9f0'], meta: '#0d1220' },
    { id: 'ember',    name: '불꽃',   desc: '숯 검정 · 주황 불씨',       sw: ['#100a07', '#ff7a1a', '#ffc23d'], meta: '#100a07', font: 'Rajdhani:wght@500;700' },
    { id: 'abyss',    name: '심해',   desc: '깊은 청록 · 아쿠아 발광',   sw: ['#03101a', '#3df5e0', '#5ab8ff'], meta: '#03101a', font: 'Exo+2:wght@500;700' },
    { id: 'venom',    name: '독',     desc: '검녹색 · 형광 연두',       sw: ['#070d08', '#b6ff3d', '#c77dff'], meta: '#070d08', font: 'Saira:wght@500;700' },
    { id: 'gold',     name: '황금',   desc: '검정 · 금박',               sw: ['#0b0a08', '#e6c36a', '#e5684f'], meta: '#0b0a08', font: 'Cinzel:wght@600;700' },
    { id: 'frost',    name: '얼음',   desc: '남회색 · 서리빛 하늘색',     sw: ['#0a1017', '#9fe3ff', '#b9a8ff'], meta: '#0a1017', font: 'Sora:wght@500;700' },
    { id: 'crimson',  name: '진홍',   desc: '검붉은 어둠 · 진홍',         sw: ['#0f0507', '#ff2e4d', '#ffc04a'], meta: '#0f0507', font: 'Oxanium:wght@500;700' },
  ];
  const byId = id => THEMES.find(t => t.id === id);
  const root = document.documentElement;

  function load() {
    try { return byId(localStorage.getItem(KEY)) || THEMES[0]; } catch (e) { return THEMES[0]; }
  }
  function save(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* 사생활 보호 모드 등 */ }
  }

  const loadedFonts = new Set();
  function loadFont(t) {
    if (!t.font || loadedFonts.has(t.font)) return;
    loadedFonts.add(t.font);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${t.font}&display=swap`;
    document.head.appendChild(l);
  }

  function apply(t) {
    root.dataset.theme = t.id;
    loadFont(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.meta;
  }

  let current = load();
  apply(current);

  const swatch = t => `<span class="theme-sw" aria-hidden="true">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>`;

  function buildPicker() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const box = document.createElement('div');
    box.className = 'theme-pick';
    box.innerHTML = `
      <button type="button" class="theme-btn" aria-haspopup="true" aria-expanded="false" aria-controls="theme-menu"></button>
      <div class="theme-menu" id="theme-menu" role="radiogroup" aria-label="테마" hidden>
        ${THEMES.map(t => `<button type="button" class="theme-opt" role="radio" data-id="${t.id}">${swatch(t)}<span>${t.name}</span><small>${t.desc}</small></button>`).join('')}
      </div>`;
    sidebar.insertBefore(box, sidebar.querySelector('.side-note'));

    const btn = box.querySelector('.theme-btn');
    const menu = box.querySelector('.theme-menu');
    const opts = [...menu.querySelectorAll('.theme-opt')];

    function render() {
      btn.innerHTML = `${swatch(current)}<span>테마</span><b>${current.name}</b>`;
      btn.setAttribute('aria-label', `테마: ${current.name} (바꾸기)`);
      opts.forEach(o => {
        const on = o.dataset.id === current.id;
        o.setAttribute('aria-checked', on);
        o.tabIndex = on ? 0 : -1;
      });
    }
    function open(v) {
      menu.hidden = !v;
      btn.setAttribute('aria-expanded', v);
      if (v) menu.querySelector('[aria-checked="true"]').focus();
    }

    btn.addEventListener('click', () => open(menu.hidden));
    menu.addEventListener('click', e => {
      const o = e.target.closest('.theme-opt');
      if (!o) return;
      current = byId(o.dataset.id);
      apply(current);
      save(current.id);
      render();
      open(false);
      btn.focus();
    });
    menu.addEventListener('keydown', e => {
      const i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        opts[(i + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length].focus();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); }
    });
    document.addEventListener('click', e => {
      if (!menu.hidden && !box.contains(e.target)) open(false);
    });

    render();
  }

  /* 다른 탭에서 바꾸면 이 탭도 따라간다 */
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    current = byId(e.newValue) || THEMES[0];
    apply(current);
    document.querySelectorAll('.theme-pick').forEach(b => b.remove());
    buildPicker();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPicker);
  else buildPicker();
})();
