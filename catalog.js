// the site's look (theme/current.json, a ?theme= variant, the editor's draft while editing; insolation_pro.html thEditor): the list takes its colours
(() => {
  const host = location.host || 'local', q = new URLSearchParams(location.search), get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const h = location.hash.match(/edit=([A-Za-z0-9_-]+)/);
  if (h) { try { const cap = JSON.parse(atob(h[1].replace(/-/g, '+').replace(/_/g, '/'))); if (cap && cap.url) { localStorage.setItem('ins.edit.cap:' + host, JSON.stringify(cap)); localStorage.setItem('ins.edit.on:' + host, 'true'); localStorage.setItem('ins.edit.known:' + host, 'true'); } } catch (_) {}
    history.replaceState(null, '', location.pathname + location.search); }
  const ok = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c), num = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
  const rgba = (c, a) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
  // the glass as the viewer's «Плашки» (insolation_pro.html THEME_KEYS defaults; the ranges as the editor's sliders); the sky stays the viewer's own
  const G = { card: ['#ffffff', ok], cardA: [0.42, x => num(x, 0, 1)], edgeA: [0.72, x => num(x, 0, 1)], blur: [26, x => num(x, 0, 60)], sat: [1.9, x => num(x, 0, 3)],
              radius: [24, x => num(x, 0, 40)], shadowA: [0.13, x => num(x, 0, 0.5)], ink: ['#1f0048', ok] };
  const put = t => { if (!t) return; const r = document.documentElement.style;
    if (ok(t.ink)) r.setProperty('--navy', t.ink); if (ok(t.accent)) r.setProperty('--orange', t.accent); if (ok(t.page)) r.setProperty('--bg', t.page);
    if (ok(t.mute)) r.setProperty('--mute', t.mute); if (ok(t.quiet)) r.setProperty('--lav2', t.quiet); };
  const glass = ts => { const g = {}; for (const k in G) { g[k] = G[k][0]; for (const t of ts) if (t && G[k][1](t[k])) g[k] = t[k]; }
    const r = document.documentElement.style;
    r.setProperty('--card', rgba(g.card, g.cardA)); r.setProperty('--edge', `rgba(255,255,255,${g.edgeA})`); r.setProperty('--glass', `blur(${g.blur}px) saturate(${g.sat})`);
    r.setProperty('--r', g.radius + 'px');
    r.setProperty('--shadow', `inset 0 1px 0 rgba(255,255,255,.6),0 10px 30px ${rgba(g.ink, g.shadowA)},0 2px 6px ${rgba(g.ink, +(g.shadowA * 0.46).toFixed(3))}`); };
  const vid = /^[a-z0-9-]{3,48}$/.test(q.get('theme') || '') ? q.get('theme') : null, editing = !!get('ins.edit.on:' + host);
  const all = (site, v) => { const d = editing ? get('ins.theme.draft:' + host) : null; put(site); put(v); put(d); glass([site, v, d]); };
  all(get('ins.theme.site:' + host), vid ? get('ins.theme.var:' + host + ':' + vid) : null);
  Promise.all([fetch('theme/current.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
               vid ? fetch(`theme/variants/${vid}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null) : null])
    .then(([site, v]) => { try { localStorage.setItem('ins.theme.site:' + host, JSON.stringify(site || {})); } catch (_) {} all(site, v); });
})();

(() => {
  const cards = [...document.querySelectorAll('.card')], $ = s => document.querySelector(s);
  cards.forEach(c => { c.dataset.base = c.getAttribute('href'); });                 // a flat opened from a filtered list keeps the filter: its arrows walk the same list
  const num = (c, k) => +c.dataset[k];
  const areas = cards.map(c => num(c, 'area')), AMIN = Math.floor(Math.min(...areas)), AMAX = Math.ceil(Math.max(...areas));
  const lo = $('#aLo'), hi = $('#aHi');
  for (const r of [lo, hi]) { r.min = AMIN; r.max = AMAX; r.step = 1; }
  const S = { rooms: new Set(), sec: new Set(), fl: new Set(), lo: AMIN, hi: AMAX, terrace: false, study: false };
  const q = new URLSearchParams(location.search);                                  // the filter lives in the address: a link opens it as it was
  const set = (k, v) => (v || '').split(',').filter(Boolean).forEach(x => S[k].add(+x));
  set('rooms', q.get('rooms')); set('sec', q.get('sec')); set('fl', q.get('fl'));
  if (q.get('area')) { const [a, b] = q.get('area').split('-').map(Number); if (a >= AMIN) S.lo = a; if (b <= AMAX && b >= S.lo) S.hi = b; }
  S.terrace = q.get('terrace') === '1'; S.study = q.get('study') === '1';
  const pills = (box, key) => box.querySelectorAll('button[data-v]').forEach(b => {
    const v = +b.dataset.v; b.setAttribute('aria-pressed', S[key].has(v));
    b.onclick = () => { S[key].has(v) ? S[key].delete(v) : S[key].add(v); apply(); };
  });
  const flag = (b, key) => { b.onclick = () => { S[key] = !S[key]; apply(); }; };
  flag($('#fTerrace'), 'terrace'); flag($('#fStudy'), 'study');
  const ru = v => String(v).replace('.', ',');
  function apply() {
    S.lo = Math.min(+lo.value, +hi.value); S.hi = Math.max(+lo.value, +hi.value);
    let n = 0;
    for (const c of cards) {
      const ok = (!S.rooms.size || S.rooms.has(num(c, 'rooms'))) && (!S.sec.size || S.sec.has(num(c, 'sec'))) && (!S.fl.size || S.fl.has(num(c, 'fl')))
        && num(c, 'area') >= S.lo - 0.05 && num(c, 'area') <= S.hi + 0.05 && (!S.terrace || c.dataset.terrace === '1') && (!S.study || c.dataset.study === '1');
      c.hidden = !ok; n += ok;
    }
    document.querySelectorAll('.catalog-results section').forEach(s => s.hidden = !s.querySelector('.card:not([hidden])'));
    ['rooms', 'sec', 'fl'].forEach(k => document.querySelectorAll(`[data-f="${k}"] button[data-v]`).forEach(b => b.setAttribute('aria-pressed', S[k].has(+b.dataset.v))));
    $('#fTerrace').setAttribute('aria-pressed', S.terrace); $('#fStudy').setAttribute('aria-pressed', S.study);
    lo.value = S.lo; hi.value = S.hi;
    const span = AMAX - AMIN || 1; $('#aFill').style.left = `${(S.lo - AMIN) / span * 100}%`; $('#aFill').style.right = `${100 - (S.hi - AMIN) / span * 100}%`;
    $('#aVal').textContent = `${ru(S.lo)} – ${ru(S.hi)} м²`;
    $('#nFound').textContent = n; $('#empty').hidden = n > 0;
    const busy = S.rooms.size || S.sec.size || S.fl.size || S.lo > AMIN || S.hi < AMAX || S.terrace || S.study; $('#reset').disabled = !busy;
    const p = new URLSearchParams();
    if (S.rooms.size) p.set('rooms', [...S.rooms].sort().join(',')); if (S.sec.size) p.set('sec', [...S.sec].sort().join(',')); if (S.fl.size) p.set('fl', [...S.fl].sort((a, b) => a - b).join(','));
    if (S.lo > AMIN || S.hi < AMAX) p.set('area', `${S.lo}-${S.hi}`); if (S.terrace) p.set('terrace', '1'); if (S.study) p.set('study', '1');
    for (const k of ['theme', 'edit']) if (q.get(k)) p.set(k, q.get(k));                     // a look variant and the editor ride along with the filters (INDEX_THEME_JS)
    try { history.replaceState(null, '', p.toString() ? `?${p}${location.hash}` : location.pathname + location.hash); } catch (_) {}
    for (const c of cards) c.setAttribute('href', c.dataset.base + (p.toString() ? `?${p}` : ''));
  }
  document.querySelectorAll('[data-f]').forEach(box => pills(box, box.dataset.f));
  lo.value = S.lo; hi.value = S.hi; lo.oninput = hi.oninput = apply;
  $('#reset').onclick = () => { S.rooms.clear(); S.sec.clear(); S.fl.clear(); S.terrace = S.study = false; lo.value = AMIN; hi.value = AMAX; apply(); };
  apply();
  const toggle = $('#filterToggle');
  const panel = $('#filters');
  toggle.addEventListener('click', () => {
    const open = panel.toggleAttribute('data-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
})();
