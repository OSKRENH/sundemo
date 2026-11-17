import * as THREE from 'three';
const response = await fetch(new URL('./apartment-data.json', import.meta.url));
if (!response.ok) {
  const error = document.getElementById('err');
  error.textContent = 'Не удалось загрузить планировку. Обновите страницу.';
  error.hidden = false;
  throw new Error('Apartment data: ' + response.status);
}
const D = await response.json();
const $ = id => document.getElementById(id);
const box = $('sun'), cv = $('gl');
const fail = m => { $('err').textContent = m; $('err').hidden = false; };
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const ru = v => String(v).replace('.', ',');
const plural = (n, one, few, many) => { const a = n % 100, b = n % 10; return `${n}\u00a0${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`; };

// ── the sun: NOAA's low-precision position, the same function as in insolation.py ──
function sunPosition(lat, lon, tz, doy, minutes) {
  const g = 2 * Math.PI / 365 * (doy - 1 + (minutes / 60 - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = rad((minutes + eqt + 4 * lon - 60 * tz) / 4 - 180), phi = rad(lat);
  const alt = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { alt: deg(alt), az: (deg(az) % 360 + 360) % 360 };
}
window.__sunPosition = sunPosition;

// ── state ──
const S = { minutes: 780, shown: 780, season: D.seasons[1], view: '3d', yaw: 35, pitch: 50, dist: 0, tyaw: 35, tpitch: 50, tdist: 0, playing: false, sun: null, room: null, idle: true, zoom: 1, tzoom: 1 };
const saved = store.get('sun.season'); if (saved && D.seasons.some(s => s.key === saved)) S.season = D.seasons.find(s => s.key === saved);
const F = D.flat;
const nWin = D.n_windows ?? D.windows.filter(w => !w.rail).length;
const TITLE_TXT = F ? `Квартира №${F.index} · ${ru(F.total)} м²` : D.title;
document.title = [TITLE_TXT, D.project].filter(Boolean).join(' — ');
if (F) {
  $('flatName').textContent = `${F.rc}-комнатная квартира №${F.index}`;
  $('flatArea').textContent = `${ru(F.total)} м²`;
  $('flatSection').textContent = F.section;
  $('flatFloor').textContent = F.floor;
  $('flatRooms').textContent = F.rc;
}

const favorite = $('favorite');
const favoriteKey = 'sun.favorite.' + F.id;
function setFavorite(selected) {
  favorite.setAttribute('aria-pressed', selected);
  favorite.querySelector('span').textContent = selected ? 'В избранном' : 'В избранное';
}
setFavorite(store.get(favoriteKey) === '1');
favorite.addEventListener('click', () => {
  const selected = favorite.getAttribute('aria-pressed') !== 'true';
  setFavorite(selected);
  store.set(favoriteKey, selected ? '1' : '0');
});
// ── the flat among the others: arrows through the gallery's list (its filter, when the flat was opened from a filtered list), the floor on the house ──
{
  const panel = $('apartmentPanel'), toggle = $('ptog');
  const fold = (hidden) => {
    panel.hidden = hidden;
    toggle.setAttribute('aria-expanded', String(!hidden));
    toggle.setAttribute('aria-label', hidden ? 'Показать панель квартиры' : 'Скрыть панель квартиры');
    toggle.title = toggle.getAttribute('aria-label');
  };
  fold(store.get('sun.lshut') === '1');
  toggle.addEventListener('click', () => {
    fold(!panel.hidden);
    store.set('sun.lshut', panel.hidden ? '1' : '0');
  });
}
// The house in the corner of a flat's page: the building as the album's key plans draw it, in a small axonometric from the courtyard side.
// The floors under the flat solid, its own floor cut open: the plate it stands on with the flat in orange and its stretches of façade, the floors above as glass.
function houseSvg(Hs, id, F, TH = 22, PH = 50) {
  const me = Hs.flats[id]; if (!me || !F || F.floor == null) return null;
  const k = F.floor, N = Hs.floors, mpu = Hs.m_per_u, lv = f => f <= 1 ? 0 : (Hs.levels[f] ?? (f - 1) * 3.3);
  const top = f => (f >= N ? lv(N) + (lv(N) - lv(N - 1)) : lv(f + 1)) / mpu;            // the top of floor f (the roof over the last one)
  const z = f => lv(f) / mpu;
  const th = TH * Math.PI / 180, ph = PH * Math.PI / 180;                                 // from the courtyard side, a little from the right, from above
  const d = [Math.sin(th) * Math.cos(ph), Math.cos(th) * Math.cos(ph), Math.sin(ph)], r = [Math.cos(th), -Math.sin(th), 0], up = [-Math.sin(th) * Math.sin(ph), -Math.cos(th) * Math.sin(ph), Math.cos(ph)];
  const P = (u, v, h) => [u * r[0] + v * r[1], -(u * up[0] + v * up[1] + h * up[2])], depth = (u, v, h) => u * d[0] + v * d[1] + h * d[2];
  const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
  const groupOf = f => Hs.groups.find(g => g.floors[0] <= f && f <= g.floors[1]);
  const walls = (poly, z0, z1) => {                                                        // the faces toward the eye, far ones first
    const s = Math.sign(area(poly)) || 1, out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); if (L < 1e-4) continue;
      const nx = s * ey / L, ny = -s * ex / L;                                            // outward (v runs down the drawing)
      if (nx * d[0] + ny * d[1] <= 0.02) continue;
      out.push({ a, b, nx, ny, z0, z1, dep: depth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2) });
    }
    return out.sort((p, q) => p.dep - q.dep);
  };
  const pts = (arr) => arr.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');
  const quad = (a, b, z0, z1) => [P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z1), P(a[0], a[1], z1)];
  const flat = (poly, h) => poly.map(([u, v]) => P(u, v, h));
  const shade = w => { const l = 0.5 + 0.5 * (w.nx * -0.55 + w.ny * 0.83); return l; };   // light from the front left: faces toward it lighter
  const parts = []; let all = [];
  const ranges = (lo, hi) => Hs.groups.map(g => [Math.max(lo, g.floors[0]), Math.min(hi, g.floors[1]), g]).filter(([a, b]) => a <= b);
  const lines = (w, f0, f1, cls) => { let s = ''; for (let f = f0 + 1; f <= f1; f++) { const h = z(f); const [p, q] = [P(w.a[0], w.a[1], h), P(w.b[0], w.b[1], h)]; s += `<line class="${cls}" x1="${p[0].toFixed(4)}" y1="${p[1].toFixed(4)}" x2="${q[0].toFixed(4)}" y2="${q[1].toFixed(4)}"/>`; } return s; };
  const foot = flat(Hs.groups[0].poly.map(([u, v]) => [u + 0.012, v - 0.004]), 0); parts.push(`<polygon class="hsh" points="${pts(foot)}"/>`);     // a soft shade on the ground under it
  // the floors under the flat
  for (const [a, b, g] of ranges(1, k - 1)) {
    const z0 = z(a), z1 = top(b);
    for (const w of walls(g.poly, z0, z1)) { const q = quad(w.a, w.b, z0, z1); all.push(...q); parts.push(`<polygon class="hw" style="--l:${shade(w).toFixed(2)}" points="${pts(q)}"/>` + lines(w, a, b, 'hf')); }
    const t = flat(g.poly, z1); all.push(...t); parts.push(`<polygon class="ht" points="${pts(t)}"/>`);
  }
  // its own floor: the plate, the flat on it, the walls of the floor as glass in the flat's colour, its own stretches of façade solid
  const g = groupOf(k), z0 = z(k), z1 = top(k), plate = Hs.plates[k] || g.poly;
  const pl = flat(plate, z0); all.push(...pl); parts.push(`<polygon class="hp" points="${pts(pl)}"/>`);
  const sp = flat(me.spot, z0 + 0.0005); parts.push(`<polygon class="hs" points="${pts(sp)}"/>`);
  const cw = walls(g.poly, z0, z1);
  for (const w of cw) { const q = quad(w.a, w.b, z0, z1); all.push(...q); parts.push(`<polygon class="hc" points="${pts(q)}"/>`); }
  for (const [u0, v0, u1, v1, nx, ny] of me.fac) { if (nx * d[0] + ny * d[1] <= 0.02) continue; parts.push(`<polygon class="hx" points="${pts(quad([u0, v0], [u1, v1], z0, z1))}"/>`); }
  // the floors above: glass
  for (const [a, b, gg] of ranges(k + 1, N)) {
    const za = z(a), zb = top(b);
    for (const w of walls(gg.poly, za, zb)) { const q = quad(w.a, w.b, za, zb); all.push(...q); parts.push(`<polygon class="hg" points="${pts(q)}"/>` + lines(w, a, b, 'hgf')); }
    const t = flat(gg.poly, zb); all.push(...t); parts.push(`<polygon class="hgt" points="${pts(t)}"/>`);
  }
  if (k === N) { const t = flat(g.poly, z1); all.push(...t); parts.push(`<polygon class="hgt" points="${pts(t)}"/>`); }
  for (const gg of Hs.groups) for (const [u, v] of gg.poly) { all.push(P(u, v, 0), P(u, v, top(N))); }
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 0.02;
  return `<svg viewBox="${(x0 - pad).toFixed(3)} ${(y0 - pad).toFixed(3)} ${(x1 - x0 + 2 * pad).toFixed(3)} ${(y1 - y0 + 2 * pad).toFixed(3)}" class="house" id="facSvg" aria-hidden="true"><defs><filter id="hblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.012"/></filter></defs>${parts.join('')}</svg>`;
}
(async () => {
  const q = new URLSearchParams(location.search);
  const here = F.id;
  const href = id => (id === here ? './' : `https://omega.photoreal3d.ru/${id}/`) + location.search;
  $('back').href = './catalog.html' + location.search;
  let cat = null, house = null;
  try { const r = await fetch('./catalog.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); cat = j.flats; house = j.house || null; } } catch (_) {}
  if (!Array.isArray(cat) || !cat.length) return;
  const setOf = k => new Set((q.get(k) || '').split(',').filter(Boolean).map(Number));      // the gallery's filter (INDEX_JS): rooms, section, floor, area, terrace, study
  const R = setOf('rooms'), SEC = setOf('sec'), FL = setOf('fl'), TER = q.get('terrace') === '1', STU = q.get('study') === '1';
  let lo = -Infinity, hi = Infinity;
  if (q.get('area')) { const [a, b] = q.get('area').split('-').map(Number); if (isFinite(a)) lo = a; if (isFinite(b)) hi = b; }
  const ok = f => (!R.size || R.has(f.rc)) && (!SEC.size || SEC.has(f.sec)) && (!FL.size || FL.has(f.fl)) && f.area >= lo - 0.05 && f.area <= hi + 0.05 && (!TER || f.terrace) && (!STU || f.study);
  const list = cat.filter(ok), mine = list.findIndex(f => f.id === here), at = cat.findIndex(f => f.id === here);
  let prev = null, next = null;
  if (mine >= 0) { prev = list[(mine - 1 + list.length) % list.length]; next = list[(mine + 1) % list.length]; }
  else if (list.length) {                                                                     // this flat is not in the filtered list: the nearest of it either way
    const before = at >= 0 ? cat.slice(0, at).filter(ok) : [], after = at >= 0 ? cat.slice(at + 1).filter(ok) : list;
    prev = before.length ? before[before.length - 1] : list[list.length - 1]; next = after.length ? after[0] : list[0];
  }
  if (prev && next && (list.length > 1 || mine < 0)) {
    $('prevB').href = href(prev.id); $('nextB').href = href(next.id);
    const nm = f => `Квартира ${f.n || ''}${f.sec != null ? `, секция ${f.sec}` : ''}${f.fl != null ? `, ${f.fl} этаж` : ''}`;
    $('prevB').title = `Предыдущая: ${nm(prev)}`; $('nextB').title = `Следующая: ${nm(next)}`;
    $('flipPos').textContent = mine >= 0 ? `${mine + 1} из ${list.length}` : `— из ${list.length}`;
    $('flip').hidden = false;
  }
  const filtered = R.size || SEC.size || FL.size || isFinite(lo) || isFinite(hi) || TER || STU;
  if (filtered) {
    const parts = [R.size ? `${[...R].sort((a, b) => a - b).join(', ')}-комн.` : null, isFinite(lo) || isFinite(hi) ? `${isFinite(lo) ? ru(lo) : '…'}–${isFinite(hi) ? ru(hi) : '…'} м²` : null,
                   SEC.size ? `секция ${[...SEC].sort((a, b) => a - b).join(', ')}` : null, FL.size ? `этаж ${[...FL].sort((a, b) => a - b).join(', ')}` : null, TER ? 'с террасой' : null, STU ? 'с кабинетом' : null].filter(Boolean);
    $('fchipT').textContent = `Фильтр: ${parts.join(' · ')}`; $('fchip').hidden = false;
    $('fchip').onclick = () => { location.href = location.pathname; };                      // the same flat, the whole list
  }
  const hs = house && house.flats && house.flats[here] && F && F.floor != null ? houseSvg(house, here, F) : null;
  if (hs) {                                                                                     // the house as the album's key plans draw it: П-shaped, its floors under the flat solid, its own floor cut open
    $('facSvg').outerHTML = hs;                                                                 // with the flat in orange, the floors above as glass (Омега's reviewer: the grid of floors looked like no building of theirs, rkj7)
    $('facCap').innerHTML = `<b>${F.floor} этаж</b> из ${house.floors}${F.section != null ? ` · секция ${F.section}` : ''}`;
    $('facade').setAttribute('aria-label', 'Квартира на схеме дома'); $('facade').hidden = false;
  } else if (F && F.floor != null) {                                                           // no key plan read for this house: the section's floors from the ground up, this one in orange
    const fls = cat.filter(f => f.sec === F.section && f.fl != null).map(f => f.fl), has = new Set(fls), n = Math.max(F.floor, ...fls);
    const rowH = 12, w = 100, x0 = 20, y0 = 8, Hh = n * rowH; let g = `<path class="rf" d="M${x0 + 6} ${y0 - 4} H${x0 + w - 6}"/><rect class="bd" x="${x0}" y="${y0}" width="${w}" height="${Hh}" rx="2.5"/>`;
    for (let f = 1; f <= n; f++) {
      const y = y0 + (n - f) * rowH, cur = f === F.floor;
      if (cur) g += `<rect class="cur" x="${x0 - 2}" y="${y + 0.5}" width="${w + 4}" height="${rowH - 1}" rx="2"/>`;
      for (let k = 0; k < 6; k++) g += `<rect class="${cur ? 'wc' : has.has(f) ? 'w' : 'wg'}" x="${x0 + 7 + k * 15.2}" y="${y + 3}" width="9" height="${rowH - 6}" rx="1"/>`;
      g += `<text class="${cur ? 'nc' : ''}" x="${x0 - 6}" y="${y + rowH / 2}">${f}</text>`;
    }
    g += `<path class="gl" d="M${x0 - 6} ${y0 + Hh + 0.7} H${x0 + w + 6}"/>`;
    $('facSvg').setAttribute('viewBox', `0 0 ${x0 + w + 8} ${y0 + Hh + 4}`); $('facSvg').innerHTML = g;
    $('facCap').innerHTML = `<b>${F.floor} этаж</b> из ${n}${F.section != null ? ` · секция ${F.section}` : ''}`;
    $('facade').hidden = false;
  }
})();

// ── the scene: plan (x, y) in metres, y up on the drawing → world (x, height, −y) ──
const W = D.size_m[0], H = D.size_m[1], cx = W / 2, cy = H / 2, diag = Math.hypot(W, H);
let gl = null; try { gl = cv.getContext('webgl2', { antialias: true }) || cv.getContext('webgl', { antialias: true }); } catch (_) {}
if (!gl) {
  fail('WebGL недоступен в этом браузере');
  throw new Error('WebGL is required');
}
const mobile = matchMedia('(max-width: 820px)').matches;
const renderer = new THREE.WebGLRenderer({ canvas: cv, context: gl, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
let needs = true, drag = null, pinch = null;                                                 // needs: a frame is due
const toWorld = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const shape = r => { const s = new THREE.Shape(r.outer.map(([x, y]) => new THREE.Vector2(x, y))); r.holes.forEach(h => s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))); return s; };
// a curve in the plan comes as short straight pieces: shade it round where two faces meet at less than `crease`, keep every real corner sharp
function roundNormals(geo, crease = 24) {
  const p = geo.attributes.position, n = p.count, cos = Math.cos(crease * Math.PI / 180), fn = [], at = new Map();
  const key = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(p, 3 * f); b.fromBufferAttribute(p, 3 * f + 1); c.fromBufferAttribute(p, 3 * f + 2);
    fn.push(new THREE.Vector3().subVectors(c, b).cross(a.sub(b)).normalize());
    for (let k = 0; k < 3; k++) { const kk = key(3 * f + k); if (!at.has(kk)) at.set(kk, []); at.get(kk).push(f); }
  }
  const out = new Float32Array(n * 3), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const own = fn[Math.floor(i / 3)], seen = []; s.set(0, 0, 0);
    for (const f of at.get(key(i))) {
      const q = fn[f]; if (q.dot(own) < cos || seen.some(v => v.dot(q) > 0.9999)) continue;   // each face direction once: a quad's two triangles do not count twice
      seen.push(q); s.add(q);
    }
    if (s.lengthSq() < 1e-12) s.copy(own); s.normalize(); out[3 * i] = s.x; out[3 * i + 1] = s.y; out[3 * i + 2] = s.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}
function prism(ringList, z0, z1, mat, cast, receive, edges = false, nameOf = null) {
  const g = new THREE.Group(); let ri = 0;
  for (const r of ringList) {
    if (r.outer.length < 3) continue;
    const geo = new THREE.ExtrudeGeometry(shape(r), { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, z0); geo.applyMatrix4(toWorld); roundNormals(geo);
    const top = (mat === M.wall || mat === M.head) && z1 >= D.ceiling_m - 0.01;             // a wall up to the ceiling: its cut on top a shade darker than its faces, the plan reads from above (Юрий, 11.11.2026)
    const m = new THREE.Mesh(geo, top ? [M.cap, mat] : mat); m.castShadow = cast; m.receiveShadow = receive; if (nameOf) m.name = nameOf(r, ri); ri++; g.add(m);
    if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), M.edge); e.renderOrder = 1; g.add(e); }   // a fine line on every edge: the walls read as a drawing
  }
  scene.add(g); return g;
}
const M = {
  wall: new THREE.MeshStandardMaterial({ color: 0xc2c5cc, roughness: 0.88, metalness: 0, envMapIntensity: 0.5 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xb4b9c1, roughness: 0.92, metalness: 0, transparent: true, opacity: 0.88, envMapIntensity: 0.3 }),   // a plain grey slab, half-see-through as the brief asks
  ceil: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }),   // the ceiling: not drawn, a faint lid only greyed the view into the flat; it still keeps the sun out from above
  glass: new THREE.MeshStandardMaterial({ color: 0xd7e9f5, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.5, metalness: 0 }),     // no polygon offset: pushed back, the frame let the partitions' edge lines that end at the glass
                                                                                               // show through it as ticks (remarks xkvt, 7wrx)
  ground: new THREE.MeshStandardMaterial({ color: 0xb7bec9, roughness: 1, metalness: 0, transparent: true }),     // transparent: its rim fades into the sky (groundFade)
  groundFade: new THREE.Vector2(1e6, 1e6 + 1),
  outline: new THREE.LineBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0.95 }),
  edge: new THREE.LineBasicMaterial({ color: 0x2c344c, transparent: true, opacity: 0.22 }),
};
M.cap = new THREE.MeshBasicMaterial({ color: 0x40326b, toneMapped: false });     // the walls' cut at the ceiling: a flat sign of the section, the colour as set, no light on it. Lit, it went lilac
                                                                                  // where the unseen floor above stops short (over the windows' heads), the sun on the cut (remark uu3k, Мариинка s1_f04_5, 13.11.2026)
M.head = M.wall.clone();               // what hangs over the glass (transoms, a bay's ceiling): its shade from the back face as three.js does by default; from the sunlit face a bent transom rippled in a low sun
M.wall.shadowSide = THREE.FrontSide;   // what stands on the floor: its shade taken from the sunlit face; from the back face it fell a few centimetres short of the wall, a bright hairline along the foot of every wall on its shady side (06.11.2026)
const SINK = 0.05;                     // what stands on the floor goes down through the slab: no seam at the foot for a low sun to slip under
M.frameTop = M.frame.clone(); M.frameTop.transparent = false;                                // the bars at ceiling height: they fade out as the view turns top-down, where they would only cross the floor-level bars
D.bands.forEach((b, k) => prism(b.rings, b.z0 > 0 ? b.z0 : -SINK, b.z1, M.wall, true, true, false, (r, i) => `Wall_${k}_${i}`));
prism(D.slab, -0.05, 0, M.floor, false, true, false, (r, i) => `Floor_${i}`);
const ceiling = prism(D.slab, D.ceiling_m + 0.03, D.ceiling_m + 0.09, M.ceil, true, false, false, (r, i) => `Ceiling_${i}`);
// the building above: the floors over this one, invisible, but the sun does not come over the roof of a flat that has twenty metres of house on top of it
const BLOCK_H = D.above_m ?? 24; M.block = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); M.block.shadowSide = THREE.DoubleSide;     /* its shade from the face toward the sun too: from the far face alone, 2 cm off the wall, the wall came out lit in stripes (remark 4b9y) */     // the floors above: their height from the flat's floor; the top floor has none
if (BLOCK_H > 0) prism(D.block_slab || D.slab, D.ceiling_m + 0.09, D.ceiling_m + 0.09 + BLOCK_H, M.block, true, false);     // block_slab: the floors above stand out over this one's glass (Омега's 2nd floor)
M.door = new THREE.MeshStandardMaterial({ color: 0x8d93a3, roughness: 0.7, metalness: 0.05 });
if (D.entrance) {                                                                              // the entrance door, shut: a leaf in the doorway, a little into the jambs and up under the wall over it (it was an open doorway with an
  const [ex0, ey0, ex1, ey1] = D.entrance, wide = ex1 - ex0 >= ey1 - ey0, e = 0.03, t = 0.035;     // invisible shield: a low sun "from inside the house" threw long rays through its seams; remark dejm, 06.11.2026)
  const cx = (ex0 + ex1) / 2, cy = (ey0 + ey1) / 2;
  const r = wide ? [[ex0 - e, cy - t], [ex1 + e, cy - t], [ex1 + e, cy + t], [ex0 - e, cy + t]] : [[cx - t, ey0 - e], [cx + t, ey0 - e], [cx + t, ey1 + e], [cx - t, ey1 + e]];
  prism([{ outer: r, holes: [] }], -SINK, D.door_h + 0.03, M.door, true, true);
}
if (D.context && D.context.length) prism(D.context, -0.5, D.ceiling_m + 0.09 + Math.max(BLOCK_H, 0), M.block, true, false);     // the rest of the house beside and behind the flat: no sun from inside the building
M.seal = M.block.clone(); M.seal.shadowSide = THREE.DoubleSide;                                // the flat's own: it casts in the ground's pass too (draw), where M.block is put away. As M.block it was gone
if (D.seal) prism(D.seal, D.ceiling_m - 0.02, D.ceiling_m + 0.12, M.seal, true, false);       // there, and a low sun from behind came in over a wall top and out through the glass: bright hairlines on the shaded ground (remarks exmm, xkuy)
ceiling.renderOrder = 3;   // a hair above the wall tops: coplanar, its shadow fell on them in patches
const PARAPET_H = D.parapet ?? 1.1;
// forged metal railing (Мариинка: "балконные ограждения и декоративные решётки, RAL 7016"): a foot, a handrail and balusters between them
// that let the sun through; the balusters are an alpha-tested stripe on the band's faces, so their shade on the floor is striped too
const METAL = D.railing_kind === 'metal';
// ── the look, editable live (Юрий, 12.11.2026: «режим редактора» for a session with the client's art director) ──────────────────────────────────
// Every colour of the model and the interface, the cards' see-through, blur and corners. Layers: the defaults here < the site's theme (theme/current.json
// in the site's bucket) < a saved variant (?theme=<id>, theme/variants/<id>.json) < the editor's draft (this browser, only while editing). The editor opens
// with ?edit=1 (this browser only) or with the link carrying the right to save (#edit=…, a signed upload policy for theme/ only: tools/theme_link.py).
const THEME_KEYS = [   // key, group, label, kind, default, min, max, step
  ['accent', 'Интерфейс', 'Акцент (выбор, кнопки)', 'color', '#1f0048'], ['sun', 'Интерфейс', 'Солнце (часы, отметки)', 'color', '#e3a03a'], ['ink', 'Интерфейс', 'Основной текст', 'color', '#1f0048'],
  ['mute', 'Интерфейс', 'Приглушённый текст', 'color', '#5e4f7d'], ['quiet', 'Интерфейс', 'Тихие элементы', 'color', '#dcdaf0'],
  ['page', 'Интерфейс', 'Фон кнопок и плана', 'color', '#e9e9f5'],
  ['card', 'Плашки', 'Цвет', 'color', '#ffffff'], ['cardA', 'Плашки', 'Непрозрачность', 'range', 0.42, 0, 1, 0.01],
  ['blur', 'Плашки', 'Размытие фона, px', 'range', 26, 0, 60, 1], ['sat', 'Плашки', 'Насыщенность фона', 'range', 1.9, 0, 3, 0.05],
  ['edgeA', 'Плашки', 'Светлая обводка', 'range', 0.72, 0, 1, 0.01], ['radius', 'Плашки', 'Скругление, px', 'range', 24, 0, 40, 1],
  ['shadowA', 'Плашки', 'Тень', 'range', 0.13, 0, 0.5, 0.01],
  ['sky1', 'Небо и свет', 'Небо днём, верх', 'color', '#9db4d8'], ['sky2', 'Небо и свет', 'Небо днём, низ', 'color', '#eef1f6'],     // the sky as it was: lilac, it met the ground in a hard line (Юрий, 13.11.2026)
  ['horizon', 'Небо и свет', 'Растушёвка горизонта', 'range', 1, 0, 1, 0.01],     // the ground melts into the sky over its outer part (Юрий, 13.11.2026: «граница между небом и землей… растушевана сильно»); 0 = the hard edge
  ['sunDay', 'Небо и свет', 'Солнце днём', 'color', '#fff3df'], ['sunLow', 'Небо и свет', 'Солнце у горизонта', 'color', '#ffb870'],
  ['sunMax', 'Небо и свет', 'Сила солнца', 'range', 9, 2, 16, 0.1], ['fill', 'Небо и свет', 'Рассеянный свет', 'range', 0.7, 0.2, 1.6, 0.01],
  ['exposure', 'Небо и свет', 'Экспозиция', 'range', 1, 0.5, 1.6, 0.01],
  ['wall', 'Модель', 'Стены', 'color', '#c2c5cc'], ['cap', 'Модель', 'Срез стен сверху', 'color', '#40326b'],     /* flat: #40326b is how the lit #4b3b6e showed in shade */     // the model in its own greys, as before the brand, the walls' cut in its purple (Юрий, 13.11.2026)
  ['head', 'Модель', 'Стена над окнами и дверями', 'color', '#c2c5cc'], ['floor', 'Модель', 'Пол', 'color', '#b4b9c1'],
  ['floorA', 'Модель', 'Пол: непрозрачность', 'range', 0.88, 0, 1, 0.01], ['frame', 'Модель', 'Рамы окон', 'color', '#fbfbfb'],
  ['glass', 'Модель', 'Стекло', 'color', '#d7e9f5'], ['glassA', 'Модель', 'Стекло: непрозрачность', 'range', 0.28, 0, 1, 0.01],
  ['rail', 'Модель', 'Ограждения', 'color', '#868e9b'], ['door', 'Модель', 'Входная дверь', 'color', '#8d93a3'],
  ['ground', 'Модель', 'Земля днём', 'color', '#b7bec9'], ['edge', 'Модель', 'Контуры', 'color', '#2c344c'],
  ['edgeAmt', 'Модель', 'Контуры: сила', 'range', 0.42, 0, 1, 0.01],
];
const TH_DEF = Object.fromEntries(THEME_KEYS.map(k => [k[0], k[4]]));
function thClean(o) {                                                                          // only known keys, colours as #rrggbb, numbers within their range: nothing else reaches the page
  const r = {}; if (!o || typeof o !== 'object') return r;
  for (const [k, , , kind, , mn, mx] of THEME_KEYS) { const v = o[k];
    if (kind === 'color' && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) r[k] = v.toLowerCase();
    else if (kind === 'range' && typeof v === 'number' && isFinite(v)) r[k] = Math.min(mx, Math.max(mn, v)); }
  return r;
}
const thGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
const thSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
const TH_HOST = location.host || 'local', TH_Q = new URLSearchParams(location.search);
const TH_VARID = /^[a-z0-9-]{3,48}$/.test(TH_Q.get('theme') || '') ? TH_Q.get('theme') : null;
(() => { const h = location.hash.match(/edit=([A-Za-z0-9_-]+)/);                               // the right to save, from the link: kept in this browser, gone from the address bar
  if (h) { try { const cap = JSON.parse(atob(h[1].replace(/-/g, '+').replace(/_/g, '/'))); if (cap && cap.url && cap.fields && cap.prefix) { thSet('ins.edit.cap:' + TH_HOST, cap); thSet('ins.edit.on:' + TH_HOST, true); } } catch (_) {}
    history.replaceState(null, '', location.pathname + location.search); }
  if (TH_Q.get('edit') === '1') thSet('ins.edit.on:' + TH_HOST, true);
  if (thGet('ins.edit.on:' + TH_HOST)) thSet('ins.edit.known:' + TH_HOST, true); })();
const TH_L = { site: thClean(thGet('ins.theme.site:' + TH_HOST)), variant: TH_VARID ? thClean(thGet('ins.theme.var:' + TH_HOST + ':' + TH_VARID)) : {},
               draft: thClean(thGet('ins.theme.draft:' + TH_HOST)), editing: !!thGet('ins.edit.on:' + TH_HOST) };
const TH = {};
const thMerge = () => Object.assign(TH, TH_DEF, TH_L.site, TH_L.variant, TH_L.editing ? TH_L.draft : {});
thMerge();
const THUMB_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34 34'><g stroke='%23ff4d00' stroke-width='2' stroke-linecap='round'><line x1='17' y1='2' x2='17' y2='6'/><line x1='17' y1='28' x2='17' y2='32'/><line x1='2' y1='17' x2='6' y2='17'/><line x1='28' y1='17' x2='32' y2='17'/><line x1='6.4' y1='6.4' x2='9.2' y2='9.2'/><line x1='24.8' y1='24.8' x2='27.6' y2='27.6'/><line x1='6.4' y1='27.6' x2='9.2' y2='24.8'/><line x1='24.8' y1='9.2' x2='27.6' y2='6.4'/></g><circle cx='17' cy='17' r='7.5' fill='%23ff4d00' stroke='%23fff' stroke-width='2'/></svg>";
const thMix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const thRgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
function thCss() {                                                                             // the interface: the page's own variables
  const r = document.documentElement.style, v = (k, x) => r.setProperty(k, x);
  v('--orange', TH.accent); v('--orange2', thMix(TH.accent, '#ffffff', 0.15)); v('--peach', thMix(TH.accent, '#ffffff', 0.84));
  v('--navy', TH.ink); v('--navy2', thMix(TH.ink, '#000000', 0.14)); v('--mute', TH.mute); v('--lav2', TH.quiet); v('--lav', thMix(TH.quiet, TH.ink, 0.4)); v('--bg', TH.page);
  v('--card', thRgba(TH.card, TH.cardA)); v('--edge', `rgba(255,255,255,${TH.edgeA})`); v('--sun', TH.sun); v('--glass', `blur(${TH.blur}px) saturate(${TH.sat})`); v('--r', TH.radius + 'px');
  v('--shadow', `inset 0 1px 0 rgba(255,255,255,.6),0 10px 30px ${thRgba(TH.ink, TH.shadowA)},0 2px 6px ${thRgba(TH.ink, +(TH.shadowA * 0.46).toFixed(3))}`);
  const ac = '%23' + TH.sun.slice(1);                                                         // the slider's handle is the sun
  v('--thumb', `url("${THUMB_SVG.replace(/%23ff4d00/g, ac)}")`); v('--thumb2', `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34 34'><circle cx='17' cy='17' r='7.5' fill='${ac}' stroke='%23fff' stroke-width='2'/></svg>")`);
}
thCss();
const RAIL_COL = TH.rail;                                                                    // all railings in a soft graphite grey: drawn in their RAL (7016, 9011) they stood out as black blots (Юрий, 11.11.2026)
function hoops(H) {                                                                            // АГР fragment 3, type 10: inverted-U bars, 150 mm a pair, under the handrail; an alpha map as the balusters are
  M.hoopsOf = M.hoopsOf || {}; if (M.hoopsOf[H]) return M.hoopsOf[H];
  const W = 120, Y = 512, c = document.createElement('canvas'); c.width = W; c.height = Y; const g = c.getContext('2d'), a = W * 0.26, b = W * 0.74, bar = W * 0.11, ry = (b - a) / 2 * (0.15 / W) / (H / Y);
  g.fillStyle = g.strokeStyle = '#fff'; g.fillRect(a - bar / 2, 6 + ry, bar, Y); g.fillRect(b - bar / 2, 6 + ry, bar, Y);
  g.lineWidth = bar; g.save(); g.translate((a + b) / 2, 6 + ry); g.scale(1, ry / ((b - a) / 2)); g.beginPath(); g.arc(0, 0, (b - a) / 2, Math.PI, 0); g.restore(); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false; t.repeat.set(1 / 0.15, 1 / H); t.offset.y = 2 - 1 / H; t.anisotropy = 4;     // the band's v falls as it goes up: the canvas's top row at the band's top
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(RAIL_COL), roughness: 0.55, metalness: 0.15, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide }); m.shadowSide = THREE.DoubleSide;
  return M.hoopsOf[H] = m;
}
function forged(ringList, curb = 0, z0 = 0) {                                                  // z0: a French balcony's railing stands on the window's sill (Мариинка: Н-350), not on the floor
  if (!M.bars) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 4; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(11, 0, 10, 4);   // a baluster a third of its 12 cm step
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.12, 1); t.magFilter = THREE.NearestFilter;   // the band's UVs run in metres along it
    const col = new THREE.Color(RAIL_COL);
    M.metal = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.15 });
    M.bars = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.15, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide });
    M.bars.shadowSide = THREE.DoubleSide;
  }
  if (curb > 0) prism(ringList, -SINK, curb, M.wall, true, true);                           // a terrace's solid curb, the balustrade on it (Омега's 3rd floor: +10,850 over +10,500)
  else prism(ringList, z0 > 0 ? z0 : -SINK, z0 > 0 ? z0 + 0.05 : 0.1, M.metal, true, true);
  const base = Math.max(curb, z0 > 0 ? z0 + 0.05 : 0.1), rail = D.railing_hoops ? 0.03 : 0.05;
  const top = curb > 0 && D.railing_h ? curb + D.railing_h : z0 >= 0.3 ? z0 + 0.55 : z0 + PARAPET_H;     // a balcony's railing 1,2 m over its floor   // on a window's sill (Мариинка, Н-350) the railing is about 0,55 m tall (АР facades); at a balcony door and round a terrace 1,2 m from the floor
  const strips = D.railing_hoops ? [] : ringList.filter(r => r.outer.length === 4 || r.path), rest = ringList.filter(r => !strips.includes(r));
  if (rest.length) prism(rest, base, top - rail, D.railing_hoops ? hoops(+(top - rail - base).toFixed(3)) : M.bars, true, true);
  if (strips.length) bars(strips, base, top - rail, z0 > 0 ? z0 : 0, top);                 // a straight railing (a French balcony, its returns): real bars, evenly spaced, a post at each end
  prism(ringList, top - rail, top, M.metal, true, true);
}
function bars(strips, zb, zt, zp0, zp1) {                                                       // along each strip's middle, end to end: an 18 mm bar every ~11 cm and a 40 mm post at both ends. The bars were an alpha
  const pts = [], ends = [];                                                                    // texture on the strip's two faces 6 cm apart: seen at an angle the two rows crossed into a mess (Юрий, 11.11.2026)
  for (const r of strips) {
    if (r.path) {                                                                               // one railing round its corners: a post at each end and each corner, the bars between
      r.path.forEach(p => ends.push(p));
      for (let k = 1; k < r.path.length; k++) {
        const A = r.path[k - 1], B = r.path[k], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(L / 0.11));
        for (let i = 1; i < n; i++) pts.push([A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n]);
      }
      continue;
    }
    const o = r.outer, E = [0, 1, 2, 3].map(i => [o[i], o[(i + 1) % 4]]), len = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const s = len(E[0]) < len(E[1]) ? 0 : 1, mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], A = mid(E[s]), B = mid(E[s + 2]), L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 0.04) continue;
    ends.push(A, B); const n = Math.max(1, Math.round(L / 0.11));
    for (let i = 1; i < n; i++) pts.push([A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n]);
  }
  const keep = (list, r) => list.filter((p, i) => !list.slice(0, i).some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < r));     // a return's end post and the railing's own stand on one spot
  const put = (list, w, z0_, z1_, name) => {
    if (!list.length) return;
    const geo = new THREE.BoxGeometry(w, z1_ - z0_, w), im = new THREE.InstancedMesh(geo, M.metal, list.length), m4 = new THREE.Matrix4();
    list.forEach(([x, y], i) => { m4.makeTranslation(x, (z0_ + z1_) / 2, -y); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true; im.name = name; scene.add(im);
  };
  const posts = keep(ends, 0.05);
  put(keep(pts, 0.03).filter(p => !posts.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06)), 0.018, zb, zt, 'RailBars');
  put(posts, 0.04, zp0 > 0 ? zp0 : -SINK, zp1, 'RailPosts');
}
const fr = 0.05, postPts = [];                                                                 // where a window's post stands: a bay's arc that starts there draws no second one
for (const w of D.windows) {                                                                   // glass in a slim white frame across each opening
  let [x0, y0, x1, y1] = w.rect; const alongX = w.axis === 'x';
  if (w.span) { if (alongX) [x0, x1] = w.span; else [y0, y1] = w.span; }                        // a pane that meets another at a corner stops at the corner post
  const L = alongX ? x1 - x0 : y1 - y0;
  let mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  if (w.at != null && (w.glazing || w.rail)) { if (alongX) my = w.at; else mx = w.at; }                 // no wall around it: the glass sits on its own line
  const [base, top] = w.z || [D.sill, D.head], h = top - base;                                  // each pane's own bottom and top: from the drawings where the project has them
  const wid = 'w' + D.windows.indexOf(w), grp = new THREE.Group(); grp.name = 'Window_' + wid; grp.position.set(mx, base + h / 2, -my); if (!alongX) grp.rotation.y = Math.PI / 2;
  if (w.rail && w.outside) {                                                                   // a public room's window at a terrace's end (АР-К facade А-М/7, type 15, on every terrace of this kind): glass and its frame as the plan draws it (remark s4ky),
    const heads = D.windows.filter(o => !o.rail && o.z).map(o => o.z[1]), tH = Math.min(D.ceiling_m, heads.length ? Math.max(...heads) : D.head), t = Math.max(alongX ? y1 - y0 : x1 - x0, 0.2);     // what lies behind it is the house: the sun is stopped there, unseen, and the wall over it goes up to the ceiling
    const put = (m, y, cast) => { m.position.set(mx, y, -my); if (!alongX) m.rotation.y = Math.PI / 2; m.castShadow = cast; m.receiveShadow = cast; scene.add(m); };
    const [gb, gt] = D.pub_z ? [D.pub_z[0], Math.min(D.ceiling_m, D.pub_z[1])] : [0, tH], gh = gt - gb;     // its glass as the project's facades draw it (Омега, АР-К 52: from 0,5 m to 2,8 m; it stood from the floor, remark nb8e)
    put(new THREE.Mesh(new THREE.BoxGeometry(L, gt + SINK, t), M.block), (gt - SINK) / 2, true);
    M.ghost = M.ghost || new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false });     // the house's wall, not the flat's: as glass, like the
    if (gb > 0.01) put(new THREE.Mesh(new THREE.BoxGeometry(L, gb + SINK, t), M.ghost), (gb - SINK) / 2, true);                         // floors above in the corner's house. Drawn as the flat's walls it stood at the
    if (D.ceiling_m - gt > 0.01) put(new THREE.Mesh(new THREE.BoxGeometry(L, D.ceiling_m - gt, t), M.ghost), (D.ceiling_m + gt) / 2, true);     // terrace's end as a stray piece of wall with a window (Юрий, 11.11.2026)
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(L, gh), M.glass); pn.renderOrder = 2; put(pn, gb + gh / 2, false);
    for (const [bw, bh, ox, oy] of [[fr, gh, -L / 2 + fr / 2, gb + gh / 2], [fr, gh, L / 2 - fr / 2, gb + gh / 2], [L, fr, 0, gt - fr / 2], [L, fr, 0, gb + fr / 2]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), M.frame); f.position.set(mx + (alongX ? ox : 0), oy, -my + (alongX ? 0 : -ox)); if (!alongX) f.rotation.y = Math.PI / 2; scene.add(f);
    }
    continue;
  }
  if (w.rail && w.french && D.french_kind !== 'metal') {                                       // a French balcony (АГР type 11, fragment 2, АР-К facades): triplex 1,2 m tall from the bottom of the glass behind it, no handrail on top,
    const pair = D.windows.filter(o => !o.rail && o.z && o.axis === w.axis).map(o => ({ o, d: alongX ? Math.abs((o.rect[1] + o.rect[3]) / 2 - my) + Math.abs((o.rect[0] + o.rect[2]) / 2 - mx) : Math.abs((o.rect[0] + o.rect[2]) / 2 - mx) + Math.abs((o.rect[1] + o.rect[3]) / 2 - my) })).sort((p, q) => p.d - q.d)[0];     // a vertical profile at each end joining it to the wall (remark bpxa)
    const near = pair && pair.d < 1.5, z0 = near ? pair.o.z[0] : 0, tall = PARAPET_H, pw = 0.05;
    const [j0, j1] = near ? (alongX ? [pair.o.rect[0], pair.o.rect[2]] : [pair.o.rect[1], pair.o.rect[3]]) : [alongX ? x0 : y0, alongX ? x1 : y1];     // jamb to jamb (АГР's plan of fragment 2), a 5 cm profile against each jamb
    const sill = near && pair.o.at != null ? pair.o.at - (alongX ? pair.o.inward[1] : pair.o.inward[0]) * 0.05 : (alongX ? my : mx);      // on the sill against the frame, 5 cm out from the glass (АГР 26, section 1-1 and plan A-A of fragment 2):
    const ly = alongX ? sill : my, lx = alongX ? mx : sill;                                                                                // at the bracket's line it stood 18-27 cm out on the SE and SW fronts, past the sill wall (the reviewers' agents, s2_x_1, 10.11.2026)
    const g = new THREE.Mesh(new THREE.BoxGeometry(j1 - j0 - pw * 2 + 0.05, tall, 0.02), M.glass), c0 = (j0 + j1) / 2; g.name = 'Rail_' + wid; g.position.set(alongX ? c0 : lx, z0 + tall / 2, alongX ? -ly : -c0); g.renderOrder = 2; if (!alongX) g.rotation.y = Math.PI / 2; scene.add(g);     // its edges run 1,5 cm into the profiles
    M.rp = M.rp || new THREE.MeshStandardMaterial({ color: new THREE.Color(RAIL_COL), roughness: 0.55, metalness: 0.15 });
    for (const [c, ab] of [[j0 + pw / 2 - 0.01, 'a'], [j1 - pw / 2 + 0.01, 'b']]) {                const f = new THREE.Mesh(new THREE.BoxGeometry(pw, tall, 0.06), M.rp); f.name = `RailProfile_${wid}_${ab}`; f.position.set(alongX ? c : lx, z0 + tall / 2, alongX ? -ly : -c); if (!alongX) f.rotation.y = Math.PI / 2; f.castShadow = true; scene.add(f); }     // 1 cm into the jamb: a face in the reveal's own plane flickered in and out of the wall (remark 7rut, s1_f03_1)
    continue;
  }
  if (w.ledge) continue;                                                                        // a bracket the drawing puts at a window with an ordinary sill: its stone sill or the pediment of the window below, no railing (Мариинка, 10.11.2026)
  if (w.rail && (METAL && !w.french || w.french && D.french_kind === 'metal')) {                                                                      // the same railing in metal, a 6 cm band along the opening
    if (w.joined) continue;                                                                     // drawn with its returns as one railing (D.guards[...].path, remark lmem)
    const h = 0.03; forged([{ outer: alongX ? [[x0, my - h], [x1, my - h], [x1, my + h], [x0, my + h]] : [[mx - h, y0], [mx + h, y0], [mx + h, y1], [mx - h, y1]], holes: [] }], 0, w.z0 || 0); continue;
  }
  if (w.rail) {                                                                                // a loggia's railing: a parapet, open above, the sun comes over it
    const par = new THREE.Mesh(new THREE.BoxGeometry(L, PARAPET_H, 0.1), M.wall); par.position.set(mx, PARAPET_H / 2, -my); if (!alongX) par.rotation.y = Math.PI / 2;
    par.castShadow = par.receiveShadow = true; scene.add(par); continue;
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(L, h), M.glass); pane.renderOrder = 2; grp.add(pane);
  const dp = 0.06, posts = w.posts || [true, true];                                            // the frame as drawn: one pane, a post only where the drawing puts one (none where the glass runs on into a bay's arc)
  const R = w.round || 0, rs = w.round_sides || [true, true], rr = sx => (rs[sx < 0 ? 0 : 1] ? R : 0);
  const bars = [];
  let drop = null;                                                                             // a segmental arch over a window of several lights (Мариинка's floor 2, АР facades): how far below the head the arc runs at local x
  if (w.arch) {
    const [A, B, rise] = w.arch, c = (A + B) / 2, Rr = ((B - A) * (B - A) / 4 + rise * rise) / (2 * rise), s0 = alongX ? mx : my;
    drop = x => { const d = s0 + x - c; return Math.max(0, Rr - Math.sqrt(Math.max(0, Rr * Rr - d * d))); };
  } else if (w.shoulder) {                                                                     // a side light whose top runs down to the outer end (the plans' icons, tools/window_tops.py):
    const s0 = alongX ? mx : my;                                                               // from the inner end, 0.415 f + 0.585 f² of the fall, the fall a share of the height
    drop = x => { let m = 0; for (const [si, so, r] of w.shoulder) { const f = (s0 + x - si) / (so - si); if (f > 0) { const g = Math.min(1, f); m = Math.max(m, r * h * (0.415 * g + 0.585 * g * g)); } } return m; };
  }
  if (drop) {                                                                                  // the frame follows the arc; the glass's upper corners sit behind the stone of the arch
    const outline = (inset) => {
      const s = new THREE.Shape(), l = -L / 2 + inset, r = L / 2 - inset, b = -h / 2 + inset, n = 24;
      s.moveTo(l, b); s.lineTo(r, b);
      for (let i = 0; i <= n; i++) { const x = r - (r - l) * i / n; s.lineTo(x, h / 2 - inset - drop(x)); }
      s.lineTo(l, b); return s;
    };
    const ring = outline(0); ring.holes.push(outline(fr));
    const g = new THREE.ExtrudeGeometry(ring, { depth: dp, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -dp / 2);
    const f = new THREE.Mesh(g, M.frame); f.castShadow = false; grp.add(f);
    if (posts[0]) postPts.push(alongX ? [x0 + fr / 2, my] : [mx, y0 + fr / 2]);
    if (posts[1]) postPts.push(alongX ? [x1 - fr / 2, my] : [mx, y1 - fr / 2]);
  } else if (R) {                                                                                     // a rounded opening: the frame follows it, one profile round the opening's outline (remark k7jr: "импосты повторяют форму проёма")
    const outline = (inset) => {
      const s = new THREE.Shape(), l = -L / 2 + inset, r = L / 2 - inset, b = -h / 2 + inset, t = h / 2 - inset, ra = Math.max(rr(-1) - inset, 0), rb = Math.max(rr(1) - inset, 0);
      s.moveTo(l, b); s.lineTo(r, b);
      if (rb > 0) { s.lineTo(r, t - rb); s.absarc(r - rb, t - rb, rb, 0, Math.PI / 2, false); } else s.lineTo(r, t);
      if (ra > 0) { s.lineTo(l + ra, t); s.absarc(l + ra, t - ra, ra, Math.PI / 2, Math.PI, false); } else s.lineTo(l, t);
      s.lineTo(l, b); return s;
    };
    const ring = outline(0); ring.holes.push(outline(fr));
    const g = new THREE.ExtrudeGeometry(ring, { depth: dp, bevelEnabled: false, curveSegments: 20 }); g.translate(0, 0, -dp / 2); roundNormals(g);
    const f = new THREE.Mesh(g, M.frame); f.castShadow = false; grp.add(f);
    if (posts[0]) postPts.push(alongX ? [x0 + fr / 2, my] : [mx, y0 + fr / 2]);
    if (posts[1]) postPts.push(alongX ? [x1 - fr / 2, my] : [mx, y1 - fr / 2]);
  } else {
    bars.push([L, fr + 0.005, 0, h / 2 - fr / 2 + 0.0025, true], [L, fr + 0.005, 0, -h / 2 + fr / 2 - 0.0025]);     // 5 mm into the wall over and under it: the frame's face in the
                                                                                               // plane of the beam's underside, the beam's edge lines ran along it as dark slits (remarks xkvt, 7wrx)
    if (posts[0]) { bars.push([fr, h, -L / 2 + fr / 2, 0]); postPts.push(alongX ? [x0 + fr / 2, my] : [mx, y0 + fr / 2]); }
    if (posts[1]) { bars.push([fr, h, L / 2 - fr / 2, 0]); postPts.push(alongX ? [x1 - fr / 2, my] : [mx, y1 - fr / 2]); }
  }
  if (w.sash && w.sash.length >= 2) {                                                          // the window by its sashes (Омега, «_Двери», remark r32n): the centre's two stiles and the impost between
    const c0 = alongX ? mx : my, st = w.sash.map(([a_, b_]) => [a_ - c0, b_ - c0]).sort((p_, q_) => p_[0] - q_[0]);     // them one post as wide as the drawing has it (17-18 cm)
    const topAt = u => { const rc = rr(Math.sign(u) || 1), d = L / 2 - Math.abs(u); return drop ? h - drop(u) : rc && d < rc ? h - rc + Math.sqrt(Math.max(0, rc * rc - (rc - d) * (rc - d))) : h; };     //
    const cuts = [-L / 2 + fr];                                                                 // Thin sash rings round each pane rippled at a distance (remark cw1q): one solid post, as before
    for (let i = 0; i + 1 < st.length; i++) {
      if (st[i + 1][0] - st[i][1] > 0.1 || st[i][0] < -L / 2 + 0.16 || st[i + 1][1] > L / 2 - 0.16) continue;
      const a_ = st[i][0], b_ = st[i + 1][1], u = (a_ + b_) / 2, top = topAt(u);
      bars.push([b_ - a_, top, u, -h / 2 + top / 2]); postPts.push(alongX ? [c0 + u, my] : [mx, c0 + u]); cuts.push(a_, b_); i++;
    }
    // no rail over and under each leaf: with it the frame stood 10 cm at the top and the bottom against the 5 cm of the corner windows and the bays (remarks 7z9v, 2lmq)
  } else
  (w.mids || []).forEach((v, i) => {                                                           // a post between two panes, where the drawing puts its square; two squares side by side: two posts
    const u = v - (alongX ? mx : my); if (Math.abs(u) >= L / 2 - fr) return;
    const rc = rr(Math.sign(u) || 1), d = L / 2 - Math.abs(u), top = drop ? h - drop(u) : rc && d < rc ? h - rc + Math.sqrt(Math.max(0, rc * rc - (rc - d) * (rc - d))) : h;     // under a rounded corner (or an arch) the post stops at the arc
    for (const d of (w.mids_double && w.mids_double[i]) ? [-fr / 2, fr / 2] : [0]) bars.push([fr, top, u + d, -h / 2 + top / 2]);
    postPts.push(alongX ? [v, my] : [mx, v]);
  });
  for (const [sx, sy, px, py, top, dd] of bars) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, dd || dp), top ? M.frameTop : M.frame); b.position.set(px, py, 0); b.castShadow = false; grp.add(b);
  }
  if (drop) {                                                                                  // the stone between the arch and the head, through the wall's depth, as the rounded corners' spandrels
    let z0, z1;
    if (w.wall) { const iv = alongX ? w.inward[1] : w.inward[0], a = alongX ? -w.wall[0] * iv : w.wall[0] * iv, b = alongX ? -w.wall[1] * iv : w.wall[1] * iv; z0 = Math.min(a, b); z1 = Math.max(a, b); }
    else { const dep = (alongX ? y1 - y0 : x1 - x0) + 0.02, off = alongX ? -((y0 + y1) / 2 - my) : ((x0 + x1) / 2 - mx); z0 = off - dep / 2; z1 = off + dep / 2; }
    const s = new THREE.Shape(), n = 24, e = 0.03; s.moveTo(-L / 2 - e, h / 2 + 0.002);                 // 3 cm past each end: the next light's spandrel meets it across the 4-5 cm between the lights
    for (let i = 0; i <= n; i++) { const x = -L / 2 - e + (L + 2 * e) * i / n; s.lineTo(x, h / 2 - drop(x)); }
    s.lineTo(L / 2 + e, h / 2 + 0.002); s.lineTo(-L / 2 - e, h / 2 + 0.002);
    if (Math.max(drop(-L / 2), drop(L / 2), drop(0)) > 0.005) {
      const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, z0);
      const m = new THREE.Mesh(g, M.head); m.castShadow = m.receiveShadow = true; m.name = 'Arch_' + wid; grp.add(m);
    }
  }
  if (R && !drop) {                                                                            // a solid spandrel in each rounded corner, through the wall's depth: flush with the wall over the window, no seam (remark qed5)
    let z0, z1;
    if (w.wall) { const iv = alongX ? w.inward[1] : w.inward[0], tIn = rs[0] !== rs[1] ? Math.min(w.wall[1], 0.03) : w.wall[1], a = alongX ? -w.wall[0] * iv : w.wall[0] * iv, b = alongX ? -tIn * iv : tIn * iv;   /* rounded on one side only (a window running on into a rounded corner): from the glass outward, or it hangs in the room like a bracket */ z0 = Math.min(a, b); z1 = Math.max(a, b); }
    else { const dep = (alongX ? y1 - y0 : x1 - x0) + 0.02, off = alongX ? -((y0 + y1) / 2 - my) : ((x0 + x1) / 2 - mx); z0 = off - dep / 2; z1 = off + dep / 2; }
    for (const sx of [-1, 1]) {
      const r = rr(sx); if (!r) continue;
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, -r); s.absarc(r, -r, r, Math.PI, Math.PI / 2, true); s.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 20 }); g.translate(0, 0, z0); roundNormals(g);
      const m = new THREE.Mesh(g, M.head); m.castShadow = m.receiveShadow = true; m.position.set(sx * L / 2, h / 2, 0); m.scale.x = -sx; grp.add(m);
    }
  }
  scene.add(grp);
}
// a rectangular bar (wide across the glass, tall) swept along a polyline at height z: the frame profile the straight windows have
function sweptBar(pts, wide, tall, z) {
  const pos = [], idx = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], t = new THREE.Vector3().subVectors(b, a).normalize(), nm = new THREE.Vector3(-t.z, 0, t.x);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(pts[i].x + nm.x * u * wide / 2, z + v * tall / 2, pts[i].z + nm.z * u * wide / 2);
    if (i) for (let k = 0; k < 4; k++) { const a0 = 4 * (i - 1) + k, a1 = 4 * (i - 1) + (k + 1) % 4, b0 = 4 * i + k, b1 = 4 * i + (k + 1) % 4; idx.push(a0, b0, b1, a0, b1, a1); }
  }
  idx.push(0, 2, 1, 0, 3, 2, 4 * (n - 1), 4 * (n - 1) + 1, 4 * (n - 1) + 2, 4 * (n - 1), 4 * (n - 1) + 2, 4 * (n - 1) + 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); const flat = g.toNonIndexed(); flat.computeVertexNormals(); return flat;   // no shared vertices: the four faces keep their own normals and the bar reads as a crisp box, not a tube
}
(D.sill_bands || []).forEach((b, k) => prism(b.rings, -SINK, b.z, M.wall, true, true, false, (r, i) => `Sill_${r.id || `b${k}_${i}`}`));                 // under each glazed opening, as high as its sill
(D.lintel_bands || []).forEach((b, k) => prism(b.rings, b.z, D.ceiling_m, M.head, true, true, false, (r, i) => `Lintel_${r.id || `b${k}_${i}`}`));     // over it, from its head to the ceiling
if (D.bay && D.bay.podium) prism(D.bay.rings, -SINK, D.bay.podium, M.wall, true, true, false, (r, i) => `BayPodium_${i}`);             // a bay's floor raised on its podium (the floor below's soffit)
if (D.bay && D.bay.soffit) prism(D.bay.rings, D.bay.soffit, D.ceiling_m, M.head, true, true, false, (r, i) => `BaySoffit_${i}`);    // a bay's ceiling, the underside of the podium above
for (const g of D.guards || []) forged([g], 0, g.z0 || 0);                                     // French balconies along slanted panes, and the returns of a railing standing out on a shelf
(D.shelves || []).forEach((s, k) => prism([s], s.z - 0.12, s.z, M.wall, true, true, false, () => `Shelf_${k}`));     // the stone shelf a French balcony stands on, 0,2 m out from the wall (Мариинка, П-К and АР facades)
if (D.decks && D.decks.length) prism(D.decks, -SINK, D.deck_z || 0, M.floor, true, true, false, (r, i) => `Deck_${i}`);     // the balcony's floor at its door's level (remark 9r5t)
if (D.railing && D.railing.length && METAL) forged(D.railing, D.railing_base || 0, D.decks && D.decks.length ? D.deck_z || 0 : 0);                                 // a balcony's railing round its whole edge (Мариинка, 7th floor, on the bays below)
else if (D.railing && D.railing.length) {                                                     // a terrace's outer railing: one run of low glass along the whole edge, a slim rail on top
  const g = prism(D.railing, 0.002, PARAPET_H - 0.04, M.glass, false, false); g.children.forEach(m => m.renderOrder = 2);
  prism(D.railing, PARAPET_H - 0.04, PARAPET_H, M.frame, false, false);
}
(D.corner_posts || []).forEach(([qx, qy], ci) => {                                           // a corner of glass: one post where the two glass lines cross, from the floor where a pane there opens onto a terrace
  const [z, zt] = (D.corner_z || [])[ci] || [D.sill, D.ceiling_m - 0.002];
  const m = new THREE.Mesh(new THREE.BoxGeometry(fr, zt - z, fr), M.frame); m.position.set(qx, (zt + z) / 2, -qy); scene.add(m); postPts.push([qx, qy]);
});
(D.curves || []).forEach((raw, ci) => {                                                        // a bay's arc of glass: one smooth ribbon floor to ceiling, rails along it, a post only where the drawing puts one
  if (raw.length < 2) return;
  const [z0, zTop] = (D.curve_z || [])[ci] || [D.sill, D.ceiling_m - 0.002], H = zTop - z0, pos = [], idx = [];
  const ca = D.curve_arch && D.curve_arch[ci], cs = D.curve_shoulder && D.curve_shoulder[ci];     // under a segmental arch (1-1's loggia): the run's along-coordinate from the builder;
  let drop = null, pts2 = raw, uD = null, tD = null;                                           // a side light whose top runs down to its outer end (a bay's side, the corner window's ends)
  if (ca) {
    const [px, py, ux, uy, A, B, rise] = ca, c = (A + B) / 2, Rr = ((B - A) * (B - A) / 4 + rise * rise) / (2 * rise);
    drop = (x, y) => { const d = (x - px) * ux + (y - py) * uy - c; return Math.max(0, Rr - Math.sqrt(Math.max(0, Rr * Rr - d * d))); }; uD = [ux, uy]; tD = [ca[7], ca[8]];
  } else if (cs) {
    drop = (x, y) => { let m = 0; for (const [ix, iy, ox, oy, r] of cs.seg) { const vx = ox - ix, vy = oy - iy, f = ((x - ix) * vx + (y - iy) * vy) / (vx * vx + vy * vy); if (f > 0) { const g = Math.min(1, f); m = Math.max(m, r * H * (0.415 * g + 0.585 * g * g)); } } return m; };
    const [p0, p1] = [raw[0], raw[raw.length - 1]], l0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); uD = [(p1[0] - p0[0]) / l0, (p1[1] - p0[1]) / l0]; tD = cs.t;
  }
  if (drop) {
    pts2 = []; for (let i = 0; i + 1 < raw.length; i++) { const [xa, ya] = raw[i], [xb, yb] = raw[i + 1], n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / 0.04)); for (let k = 0; k < n; k++) pts2.push([xa + (xb - xa) * k / n, ya + (yb - ya) * k / n]); }
    pts2.push(raw[raw.length - 1]);
  }
  const topAt = (x, y) => H - (drop ? drop(x, y) : 0);
  for (let i = 0; i < pts2.length; i++) { const [x, y] = pts2[i]; pos.push(x, z0, -y, x, z0 + topAt(x, y), -y); if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const ribbon = new THREE.Mesh(geo, M.glass); ribbon.renderOrder = 2; scene.add(ribbon);
  const pts = new THREE.CatmullRomCurve3(raw.map(([x, y]) => new THREE.Vector3(x, 0, -y)), false, 'centripetal', 0.2).getPoints(Math.max(16, raw.length * 4));
  M.frameArc = M.frameArc || Object.assign(M.frame.clone(), { side: THREE.DoubleSide });       // the swept bar's faces turn inward on half the arcs: seen from outside its top rail was not there,
  M.frameTop.side = THREE.DoubleSide;                                                          // the glass's colour showed instead (remarks 2sjl, g9u7)
  for (const [z, mat] of [[z0 + fr / 2, M.frameArc], [z0 + H - fr / 2, M.frameTop]]) if (!(drop && mat === M.frameTop)) scene.add(new THREE.Mesh(sweptBar(pts, 0.06, fr, z), mat));       // the same rectangular profile as the straight frames, bent along the arc
  if (drop) for (let i = 0; i + 1 < pts2.length; i++) {                                        // the head of the frame along the arch: short bars, each sloped as the arc there
    const [xa, ya] = pts2[i], [xb, yb] = pts2[i + 1], l = Math.hypot(xb - xa, yb - ya); if (l < 1e-4) continue;
    const za = z0 + topAt(xa, ya) - fr / 2, zb = z0 + topAt(xb, yb) - fr / 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(l, zb - za) + 0.004, fr, 0.06), M.frameTop);
    m.position.set((xa + xb) / 2, (za + zb) / 2, -(ya + yb) / 2); m.rotation.set(0, Math.atan2(yb - ya, xb - xa), Math.atan2(zb - za, l), 'YZX'); m.castShadow = false; scene.add(m);
  }
  if (drop && tD) for (let i = 0; i + 1 < raw.length; i++) {                                  // the stone between the arc and the head, through the wall's depth (as over the straight arched windows)
    const [xa, ya] = raw[i], [xb, yb] = raw[i + 1], l = Math.hypot(xb - xa, yb - ya); if (l < 0.02) continue;
    const dx = (xb - xa) / l, dy = (yb - ya) / l, sg = dx * uD[0] + dy * uD[1] >= 0 ? 1 : -1, t0 = tD[0], t1 = tD[1], n = Math.max(2, Math.ceil(l / 0.04));
    const sE = D.curve_stone_e && D.curve_stone_e[ci], eA = i === 0 && sE ? sE[0] : 0.03, eB = i + 2 === raw.length && sE ? sE[1] : 0.03;     // past the pane's ends only within the outline (remark ul2e)
    const sh = new THREE.Shape(); sh.moveTo(-eA, H + 0.002); let most = 0;
    for (let k = 0; k <= n; k++) { const u = -eA + (l + eA + eB) * k / n, x = xa + dx * u, y = ya + dy * u; most = Math.max(most, drop(x, y)); sh.lineTo(u, topAt(x, y)); }
    sh.lineTo(l + eB, H + 0.002); sh.lineTo(-eA, H + 0.002);
    if (most < 0.005) continue;
    const g = new THREE.ExtrudeGeometry(sh, { depth: t1 - t0, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, sg > 0 ? -t1 : t0);     // local +z is the pane's -normal: the wall's t0..t1
    const m = new THREE.Mesh(g, M.head); m.position.set(xa, z0, -ya); m.rotation.y = Math.atan2(yb - ya, xb - xa); m.castShadow = m.receiveShadow = true; m.name = 'Arch_c' + ci; scene.add(m);
  }
  for (const [qx, qy] of (D.curve_mids && D.curve_mids[ci]) || []) {                               // a post along the curve, where the drawing puts its square: square to the glass there
    let j = 0, best = 1e9; for (let i = 0; i < raw.length - 1; i++) { const d = Math.hypot((raw[i][0] + raw[i + 1][0]) / 2 - qx, (raw[i][1] + raw[i + 1][1]) / 2 - qy); if (d < best) { best = d; j = i; } }
    const hq = topAt(qx, qy), m = new THREE.Mesh(new THREE.BoxGeometry(fr, hq, fr), M.frame); m.position.set(qx, z0 + hq / 2, -qy); m.rotation.y = Math.atan2(raw[j + 1][1] - raw[j][1], raw[j + 1][0] - raw[j][0]); scene.add(m); postPts.push([qx, qy]);     // plan (dx, dy) is scene (dx, -dy): the angle without a minus (remarks 0j7q, qbva: the posts of the 30° wing stood turned 60° off the pane)
  }
  const cp = (D.curve_posts && D.curve_posts[ci]) || [true, true];
  [[0, 1], [raw.length - 1, raw.length - 2]].forEach(([i, j], k) => {
    if (!cp[k] || postPts.some(([px, py]) => Math.hypot(px - raw[i][0], py - raw[i][1]) < 0.12)) return;
    const hq = topAt(raw[i][0], raw[i][1]), m = new THREE.Mesh(new THREE.BoxGeometry(fr, hq, fr), M.frame); m.position.set(raw[i][0], z0 + hq / 2, -raw[i][1]);
    m.rotation.y = Math.atan2(raw[j][1] - raw[i][1], raw[j][0] - raw[i][0]); scene.add(m); postPts.push([raw[i][0], raw[i][1]]);
  });
});
window.__posts = postPts;                                                                     // every vertical frame member as built, for the post audit
M.ground.onBeforeCompile = sh => {                                                              // a grid of dots on the ground, a metre apart, fading out a dozen metres beyond the flat (Юрий, 11.11.2026)
  sh.uniforms.gC = { value: new THREE.Vector2(cx, -cy) }; sh.uniforms.gR = { value: new THREE.Vector2(diag / 2 + 2, diag / 2 + 14) };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw;').replace('#include <project_vertex>', '#include <project_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw; uniform vec2 gC; uniform vec2 gR; uniform vec2 gF;').replace('#include <color_fragment>', `#include <color_fragment>
    { vec2 q = vGw.xz; float d = length(fract(q) - 0.5); float aa = fwidth(d) * 1.2; float dt = 1.0 - smoothstep(0.042 - aa, 0.042 + aa, d);
      diffuseColor.rgb *= 1.0 - 0.62 * dt * (1.0 - smoothstep(gR.x, gR.y, length(q - gC)));
      diffuseColor.a *= 1.0 - smoothstep(gF.x, gF.y, length(q - gC)); }`);
  sh.uniforms.gF = { value: M.groundFade };
};
const ground = new THREE.Mesh(new THREE.CircleGeometry(diag * 1.7, 96), M.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.06, -cy); ground.receiveShadow = true; scene.add(ground);
ground.renderOrder = -1;                                                                      // the first of the see-through things: under the half-see-through floor and the glass, as when it was solid
groundFade();
const hemi = new THREE.HemisphereLight(0xeef3fb, 0xd3d7e2, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6b0, 7); sun.castShadow = true; scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096); sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.015; sun.shadow.radius = 3;
const CTX_R = Math.max(0, ...(D.context || []).flatMap(r => r.outer.map(([x, y]) => Math.hypot(x - cx, y - cy)))) + 3;      // how far the rest of the house reaches from the flat's middle
const SUN_R = Math.max(diag * 1.5 + 4 + BLOCK_H, CTX_R);                                    // the sun's light stands outside all of it. On the top floors (little house above, a short BLOCK_H) it stood inside the blocks
const sc = sun.shadow.camera; sc.left = sc.bottom = -(diag / 2 + 1); sc.right = sc.top = diag / 2 + 1; sc.near = 1; sc.far = SUN_R * 2 + diag; sc.updateProjectionMatrix();     // beside the flat, their far faces behind it, and a low sun from behind the house lit the blind walls they stand against (Мариинка s1_f08_2, the reviewers' agents, 10.11.2026)
// the sun itself: a soft sprite
function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(255,248,225,1)'); r.addColorStop(0.18, 'rgba(255,230,160,.95)'); r.addColorStop(0.45, 'rgba(255,200,110,.35)'); r.addColorStop(1, 'rgba(255,190,100,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(3.2, 3.2, 1); return s;
}
const sunBall = glowSprite(); scene.add(sunBall);
const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xff6a26, dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.55 })); scene.add(ray);
// a soft environment for the materials, if the addon arrives; the page works without it
import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; needs = true;
}).catch(() => {});
// the room outline, shown for the room under the pointer in the list
const outline = new THREE.LineLoop(new THREE.BufferGeometry(), M.outline); outline.visible = false; outline.renderOrder = 4; scene.add(outline);
function showOutline(room) {
  if (!room) { outline.visible = false; needs = true; return; }
  outline.geometry.dispose(); outline.geometry = new THREE.BufferGeometry().setFromPoints(room.poly.map(([x, y]) => new THREE.Vector3(x, 0.012, -y))); outline.visible = true; needs = true;
}

// ── cameras ──
const persp = new THREE.PerspectiveCamera(40, 1, 0.1, 500), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
S.dist = S.tdist = diag * 1.3;
const FC = (() => {                                                                             // the flat's own middle (its floor plate's box), not the drawing sheet's: on a long flat the camera
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;                                                  // turned round a point off to one side (remark tx01)
  (D.slab || []).forEach(r => r.outer.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  return x1 > x0 ? [(x0 + x1) / 2, (y0 + y1) / 2] : [cx, cy];
})();
const target = new THREE.Vector3(FC[0], 0.5, -FC[1]), ttarget = target.clone();
function homeTarget() { S.room = null; ttarget.set(FC[0], 0.5, -FC[1]); }
function placeCamera() {
  if (S.view === 'top') {
    ortho.position.set(target.x, 60, target.z); ortho.up.set(0, 0, -1); ortho.lookAt(target.x, 0, target.z);
    const a = cv.clientWidth / Math.max(1, cv.clientHeight), pad = 1.12, hw = Math.max(W * pad / 2, H * pad / 2 * a), hh = hw / a;
    ortho.left = -hw * S.zoom; ortho.right = hw * S.zoom; ortho.top = hh * S.zoom; ortho.bottom = -hh * S.zoom; ortho.updateProjectionMatrix();
    return ortho;
  }
  const y = rad(S.yaw), p = rad(S.pitch);
  persp.position.set(target.x + S.dist * Math.cos(p) * Math.sin(y), target.y + S.dist * Math.sin(p), target.z + S.dist * Math.cos(p) * Math.cos(y));
  persp.up.set(0, 1, 0); persp.lookAt(target); return persp;
}
function resize() {
  const w = box.clientWidth, h = box.clientHeight;
  renderer.setSize(w, h, false);
  persp.aspect = w / h;
  persp.zoom = 0.78 * Math.min(1, persp.aspect / 1.12);
  persp.setViewOffset(w, h, 0, h * 0.065, w, h);
  needs = true;
}
new ResizeObserver(resize).observe(box); resize();

// ── colours of the hour: sky, sun, exposure ──
const col = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
const SKY = { night: ['#171c2b', '#2c344c'], dawn: ['#46507a', '#f4b89c'], day: ['#9db4d8', '#eef1f6'] };          // the developer's navy by night, its grey-blue by day, a peach dawn
function skyFor(alt) {
  if (alt <= -10) return SKY.night;
  if (alt < 0) { const t = (alt + 10) / 10; return [col(SKY.night[0], SKY.dawn[0], t).getStyle(), col(SKY.night[1], SKY.dawn[1], t).getStyle()]; }
  if (alt < 12) { const t = alt / 12; return [col(SKY.dawn[0], SKY.day[0], t).getStyle(), col(SKY.dawn[1], SKY.day[1], t).getStyle()]; }
  return SKY.day;
}

// ── the sun over the plan: azimuth clockwise from north; the plan's top edge points to bearing north_deg ──
const sunDir = s => { const theta = rad(s.az - D.north_deg), alt = rad(Math.max(s.alt, 0.5)); return new THREE.Vector3(Math.sin(theta) * Math.cos(alt), Math.sin(alt), -Math.cos(theta) * Math.cos(alt)); };
function updateSun() {
  const s = sunPosition(D.lat, D.lon, D.tz, S.season.doy, S.shown); S.sun = s;
  const up = s.alt > -0.833, dir = sunDir(s), R = SUN_R;
  const half = diag / 2 + 1 + BLOCK_H * Math.cos(rad(Math.max(0, s.alt)));                    // the shadow frustum takes in the block above, seen from the sun's angle
  if (Math.abs(sc.right - half) > 1e-3) { sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.updateProjectionMatrix(); }
  sun.shadow.normalBias = Math.max(0.015, 1.3 * 2 * half / sun.shadow.mapSize.x);            // a texel of the shadow map and a third: on a low floor under a low sun the frustum takes in 25 m of house above, a texel grows to 1,6 cm and walls lit at a glancing angle went striped (Мариинка's 2nd floor)
  sun.position.copy(target).addScaledVector(dir, R); sun.target.position.copy(target);
  const warm = clamp(s.alt / 25, 0, 1);
  sun.color.copy(col(TH.sunLow, TH.sunDay, warm)); sun.intensity = up ? lerp(2.5, TH.sunMax, clamp(s.alt / 20, 0, 1)) : 0; sun.visible = up;
  const dayness = clamp((s.alt + 10) / 20, 0, 1); scene.environmentIntensity = lerp(0.08, 0.4, dayness);
  const [k1, k2] = skyFor(s.alt); box.style.setProperty('--sky1', k1); box.style.setProperty('--sky2', k2);
  hemi.color.copy(col('#4e5f88', '#eef3fb', dayness)); hemi.groundColor.copy(col('#2f3442', '#d3d7e2', dayness)); hemi.intensity = lerp(0.45, TH.fill, dayness);       // little sky fill (was 1.15) and a mid-grey floor: the sun's patches need room above the shade to read, a light floor and a strong fill washed them out
  M.ground.color.copy(col('#242a3a', TH.ground, dayness)); box.classList.toggle('dark', s.alt < -2);
  renderer.toneMappingExposure = lerp(0.6, TH.exposure, dayness);
  sunBall.visible = ray.visible = up; sunBall.position.copy(target).addScaledVector(dir, diag * 0.9 + 2);
  sunBall.material.opacity = lerp(0.6, 1, warm);
  ray.geometry.setFromPoints([sunBall.position.clone(), target.clone()]); ray.computeLineDistances();
  // the readout
  $('clock').textContent = hhmm(S.shown); $('slider').setAttribute('aria-valuetext', hhmm(S.shown));
  const dl = S.season.daylight, st = $('state'); $('time').classList.toggle('night', !up);
  if (up) st.innerHTML = `Солнце над горизонтом<br>высота <b>${s.alt.toFixed(0)}°</b> · азимут <b>${s.az.toFixed(0)}°</b>`;
  else st.innerHTML = dl ? `Солнце ниже горизонта<br>день <b>${hhmm(dl[0])}–${hhmm(dl[1])}</b>` : 'Солнце ниже горизонта';
  // the rose turns with the view, so that north on it is north on the screen; the dot is the sun's azimuth, the dotted arc the day's path
  const screenNorth = D.north_deg - (S.view === 'top' ? 0 : S.yaw);
  $('dial').setAttribute('transform', `rotate(${-screenNorth})`);
  const a = rad(s.az - screenNorth); $('sunpt').setAttribute('cx', (38 * Math.sin(a)).toFixed(2)); $('sunpt').setAttribute('cy', (-38 * Math.cos(a)).toFixed(2)); $('sunpt').classList.toggle('down', !up);
  if (dl) { const pts = []; for (let m = dl[0]; m <= dl[1]; m += 10) { const q = sunPosition(D.lat, D.lon, D.tz, S.season.doy, m), r = 38 - q.alt / 90 * 18, b = rad(q.az - screenNorth); pts.push(`${(r * Math.sin(b)).toFixed(1)},${(-r * Math.cos(b)).toFixed(1)}`); } $('trail').setAttribute('d', 'M' + pts.join('L')); }
  // the arc of the day
  const dot = $('arcDot'); dot.setAttribute('cx', (S.shown / 1440 * 200).toFixed(1)); dot.setAttribute('cy', (44 - Math.max(s.alt, -8) / 90 * 40).toFixed(1)); dot.classList.toggle('down', !up);
  for (const l of labelsUI) l.el.classList.toggle('dim', !up);
  needs = true;
}
function updateDay() {
  const dl = S.season.daylight, e = $('dayspan');
  if (!dl) { e.style.display = 'none'; } else { e.style.display = ''; e.style.left = `${dl[0] / 1440 * 100}%`; e.style.right = `${100 - dl[1] / 1440 * 100}%`; }
  const day = [], night = [];
  for (let m = 0; m <= 1440; m += 10) { const q = sunPosition(D.lat, D.lon, D.tz, S.season.doy, m); const p = `${(m / 1440 * 200).toFixed(1)},${(44 - Math.max(q.alt, -8) / 90 * 40).toFixed(1)}`; (q.alt > -0.833 ? day : night).push(p); }
  $('arcDay').setAttribute('d', day.length ? 'M' + day.join('L') : ''); $('arcNight').setAttribute('d', 'M' + night.join('L'));
  $('arcSr').textContent = dl ? `восход ${hhmm(dl[0])}` : ''; $('arcSs').textContent = dl ? `заход ${hhmm(dl[1])}` : '';
  document.querySelectorAll('.ticks .sr,.ticks .ss').forEach(x => x.remove());
  if (dl) for (const [m, c] of [[dl[0], 'sr'], [dl[1], 'ss']]) { const t = document.createElement('span'); t.className = c; t.style.left = `${m / 1440 * 100}%`; t.textContent = hhmm(m); $('ticks').appendChild(t); }
  computeRoomSun();
}

// ── direct sun per room: the minutes when the sun stands in front of one of the room's windows (80° either side of its normal) and reaches it past the house ──
const roomsById = Object.fromEntries(D.rooms.map(r => [r.id, r]));
function computeRoomSun() {
  const byRoom = {};
  for (const r of D.rooms) byRoom[r.id] = [];
  const wins = [...D.windows.map((w, k) => ({ w, key: 'w' + k })), ...(D.curve_rooms || []).map((w, k) => ({ w, key: 'c' + k }))].filter(o => o.w && o.w.room != null && byRoom[o.w.room]);     // bays' arcs and slanted panes light their rooms too
  const L = D.lit && D.lit[S.season.key], bits = b => { const t = atob(b), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
  const masks = L ? Object.fromEntries(wins.filter(o => L[o.key]).map(o => [o.key, bits(L[o.key])])) : null;      // built with the house: the sun past the flat's own walls and the rest of the house (insolation.lit_of)
  for (let m = 0; m < 1440; m += 2) {
    const q = sunPosition(D.lat, D.lon, D.tz, S.season.doy, m); if (q.alt < 3) continue;
    const theta = rad(q.az - D.north_deg), sx = Math.sin(theta), sy = Math.cos(theta);
    for (const { w, key } of wins) {
      if (masks) { const u = masks[key], i = m / 2; if (u && (u[i >> 3] & (0x80 >> (i & 7)))) byRoom[w.room].push(m); continue; }
      const nx = -w.inward[0], ny = -w.inward[1];                                               // an older page: the angle alone (a bay's side light also in front of its façade, w.face)
      if (sx * nx + sy * ny > Math.cos(rad(80)) && (!w.face || sx * w.face[0] + sy * w.face[1] > 0.035)) byRoom[w.room].push(m);
    }
  }
  for (const r of D.rooms) {
    const ms = [...new Set(byRoom[r.id])].sort((a, b) => a - b), iv = [];
    for (const m of ms) { if (iv.length && m - iv[iv.length - 1][1] <= 0) iv[iv.length - 1][1] = m + 2; else iv.push([m, m + 2]); }     // each sample stands for its two minutes: «52 мин · 10:56–11:46» read as 50 (the reviewers' agents)
    r.sun = { minutes: ms.length * 2, intervals: iv.filter(([a, b]) => b - a >= 10) };
  }
  renderRoomList();
}
function sunSpans(s) {                 // the intervals listed add up to the total: what came in bursts under 10 minutes is said so («8 мин ·» stood with nothing after it; the reviewers' agents, 10.11.2026)
  const listed = s.intervals.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(', '), rest = s.minutes - s.intervals.reduce((t, [a, b]) => t + b - a, 0);
  return rest > 0 ? (listed ? `${listed} и ещё ${fmtDur(rest)} короткими интервалами` : 'короткими интервалами') : listed;
}
function fmtDur(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`; }
function renderRoomList() {
  const ul = $('roomList'); ul.innerHTML = '';
  const lit = [...D.rooms].filter(r => r.sun.minutes > 0).sort((a, b) => b.sun.minutes - a.sun.minutes);     // the rooms with direct sun only, this season (Юрий, 13.11.2026)
  if (!lit.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'В этот сезон прямого солнца нет ни в одной комнате'; ul.appendChild(li); }
  for (const r of lit) {
    const li = document.createElement('li'); li.dataset.id = r.id;
    const iv = r.sun.intervals.map(([a, b]) => `<i style="left:${a / 1440 * 100}%;width:${(b - a) / 1440 * 100}%"></i>`).join('');
    li.innerHTML = `<b>${r.name}</b><span>${ru(r.area_m2)} м²</span><div class="bar">${iv}</div><div class="h ${r.sun.minutes ? '' : 'none'}">${r.sun.minutes ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>${fmtDur(r.sun.minutes)} · ${sunSpans(r.sun)}` : 'без прямого солнца'}</div>`;
    li.addEventListener('mouseenter', () => hover(r)); li.addEventListener('mouseleave', () => hover(null));
    li.addEventListener('click', () => focusRoom(r));
    ul.appendChild(li);
  }
}
function hover(r) {
  showOutline(r);
  $('ivals').innerHTML = r ? r.sun.intervals.map(([a, b]) => `<i style="left:${a / 1440 * 100}%;width:${(b - a) / 1440 * 100}%"></i>`).join('') : '';
  for (const l of labelsUI) l.el.classList.toggle('on', !!r && l.room === r);
  document.querySelectorAll('#roomList li').forEach(li => li.classList.toggle('on', !!r && +li.dataset.id === r.id));
}
function focusRoom(r) {
  S.idle = false;
  if (S.room === r) { homeTarget(); S.tdist = diag * 1.3; S.tzoom = 1; }
  else { S.room = r; const px = r.poly.map(p => p[0]), py = r.poly.map(p => p[1]); ttarget.set((Math.min(...px) + Math.max(...px)) / 2, 0.3, -(Math.min(...py) + Math.max(...py)) / 2); S.tdist = Math.max(4, Math.hypot(Math.max(...px) - Math.min(...px), Math.max(...py) - Math.min(...py)) * 1.9); S.tzoom = 0.55; }
  needs = true;
}

// ── the time scale ──
const slider = $('slider');
for (let h = 0; h <= 24; h += 3) { const s = document.createElement('span'); if (h % 6) s.className = 'minor'; s.style.left = `${h / 24 * 100}%`; s.textContent = `${String(h).padStart(2, '0')}:00`; $('ticks').appendChild(s); }
slider.addEventListener('input', () => { S.minutes = +slider.value; if (S.playing) stopPlay(); });
let playT = null;
function stopPlay() { S.playing = false; $('playIco').innerHTML = '<path d="M7 4l14 8-14 8z"/>'; $('play').setAttribute('aria-label', 'Проиграть день'); }
$('play').addEventListener('click', () => {
  if (S.playing) return stopPlay();
  S.playing = true; $('playIco').innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'; $('play').setAttribute('aria-label', 'Остановить');
  const dl = S.season.daylight || [0, 1440]; if (S.minutes >= dl[1] - 1 || S.minutes < dl[0]) S.minutes = S.shown = dl[0];
});

// ── seasons ──
const ICON = { winter: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/>', mid: '<path d="M4 20c0-8 4-14 14-16-1 9-6 14-14 16zM4 20l8-8"/>', summer: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>' };
for (const s of D.seasons) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.key = s.key; b.innerHTML = `<svg viewBox="0 0 24 24">${ICON[s.key] || ''}</svg>${s.name}<small>${s.date}</small>`; b.setAttribute('aria-pressed', s === S.season);
  b.addEventListener('click', () => { S.season = s; store.set('sun.season', s.key); [...$('seasons').children].forEach(x => x.setAttribute('aria-pressed', x === b)); updateDay(); updateSun(); hover(null); needs = true; });     // updateSun: with the camera at rest the season changed the hours in the list and left the sun and the shadows of the season before, until the slider or the camera moved (10.11.2026)
  $('seasons').appendChild(b);
}

// ── views ──
const plan2d = $('plan2d');
const wrap = document.createElement('div'); wrap.className = 'wrap'; plan2d.appendChild(wrap);
if (D.svg) wrap.innerHTML = D.svg; else if (D.png) { const im = new Image(); im.src = D.png; im.alt = 'План этажа'; wrap.appendChild(im); } else wrap.innerHTML = '<p style="color:#6b6b6b">Чертёж плана не приложен</p>';
// the drawing zooms and pans (remark kh8j: "увеличить масштаб или регулировать"): it opens fitted to the flat, not to the whole sheet; wheel, pinch, drag, + / − / ⤢
const PZ = { k: 1, x: 0, y: 0, fit: null };
const zoomUI = document.createElement('div'); zoomUI.className = 'pz card';
zoomUI.innerHTML = '<button type="button" data-z="in" aria-label="Крупнее">+</button><button type="button" data-z="out" aria-label="Мельче">−</button><button type="button" data-z="fit" aria-label="По размеру квартиры">⤢</button>';
plan2d.appendChild(zoomUI);
const pimg = wrap.querySelector('img, svg');
function pzApply() { if (pimg) pimg.style.transform = `translate(${PZ.x}px, ${PZ.y}px) scale(${PZ.k})`; }
function pzFit() {                                                           // the flat's outline on the sheet (plan_frame: the sheet in the model's metres) fills the view
  if (!pimg || !D.plan_frame || !pimg.clientWidth) { PZ.k = 1; PZ.x = PZ.y = 0; return pzApply(); }
  const [fx0, fy0, fx1, fy1] = D.plan_frame; let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const r of D.slab) for (const [x, y] of r.outer) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const W = pimg.clientWidth, H = pimg.clientHeight, u = (x) => (x - fx0) / (fx1 - fx0) * W, v = (y) => (fy1 - y) / (fy1 - fy0) * H;
  const pad = 0.12, cw = wrap.clientWidth, ch = wrap.clientHeight, w = (u(bx1) - u(bx0)) * (1 + pad), h = (v(by0) - v(by1)) * (1 + pad);
  PZ.k = Math.max(1, Math.min(cw / w, ch / h, 6));
  const cx = (u(bx0) + u(bx1)) / 2, cy = (v(by0) + v(by1)) / 2;               // the image is laid out centred in the wrap; translate so the flat's centre comes to the centre
  PZ.x = (W / 2 - cx) * PZ.k; PZ.y = (H / 2 - cy) * PZ.k; pzApply();
}
function pzZoom(f, ox = 0, oy = 0) { const k = Math.max(0.5, Math.min(PZ.k * f, 10)); PZ.x = ox - (ox - PZ.x) * k / PZ.k; PZ.y = oy - (oy - PZ.y) * k / PZ.k; PZ.k = k; pzApply(); }
if (pimg) {
  pimg.style.transformOrigin = 'center center'; pimg.style.transition = 'transform .12s ease-out'; pimg.draggable = false;
  zoomUI.addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (!z) return; if (z.dataset.z === 'fit') pzFit(); else pzZoom(z.dataset.z === 'in' ? 1.4 : 1 / 1.4); });
  plan2d.addEventListener('wheel', e => { e.preventDefault(); const r = pimg.parentElement.getBoundingClientRect(); pzZoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); }, { passive: false });
  let pd = null;
  plan2d.addEventListener('pointerdown', e => { if (e.target.closest('.pz')) return; pd = { x: e.clientX, y: e.clientY, px: PZ.x, py: PZ.y }; plan2d.setPointerCapture(e.pointerId); pimg.style.transition = 'none'; });
  plan2d.addEventListener('pointermove', e => { if (!pd) return; PZ.x = pd.px + e.clientX - pd.x; PZ.y = pd.py + e.clientY - pd.y; pzApply(); });
  plan2d.addEventListener('pointerup', () => { pd = null; pimg.style.transition = 'transform .12s ease-out'; });
}
for (const b of document.querySelectorAll('.seg button[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
function setView(v) {
  if (v === '3d' && S.view === 'top' && !S.room) homeTarget();                                   // a pan in the top view does not carry over: the 3D view turns round the flat's middle (tx01)
  S.view = v; S.idle = false; document.querySelectorAll('.seg button[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  plan2d.hidden = v !== 'plan'; cv.style.visibility = v === 'plan' ? 'hidden' : ''; $('labels').style.display = v === 'plan' || !S.labels ? 'none' : '';
  $('hint').style.opacity = v === '3d' ? 1 : 0;
  if (v === 'plan' && pimg && !PZ.seen) { PZ.seen = true; requestAnimationFrame(() => (pimg.complete ? pzFit() : pimg.addEventListener('load', pzFit, { once: true }))); }     // fitted to the flat the first time it opens
  needs = true;
}
S.labels = store.get('sun.labels') !== '0';                                                       // the rooms' names over the model: shown or put away (Юрий, 11.11.2026)
function showLabels(v) { S.labels = v; $('lbB').setAttribute('aria-pressed', v); $('labels').style.display = S.view === 'plan' || !v ? 'none' : ''; store.set('sun.labels', v ? '1' : '0'); needs = true; }
showLabels(S.labels); $('lbB').addEventListener('click', () => showLabels(!S.labels));
$('roomsB').addEventListener('click', () => { const r = $('rooms'); r.classList.toggle('shut'); $('roomsB').setAttribute('aria-expanded', !r.classList.contains('shut')); });
function foldTime(shut) {                                                                     // the time card folds to the play button and the clock; the day still plays
  $('time').classList.toggle('shut', shut); box.classList.toggle('tshut', shut);
  $('timeB').setAttribute('aria-expanded', !shut); $('timeB').setAttribute('aria-label', shut ? 'Развернуть шкалу' : 'Свернуть шкалу');
  store.set('sun.timeShut', shut ? '1' : ''); needs = true;
}
$('timeB').addEventListener('click', () => foldTime(!$('time').classList.contains('shut')));
if (store.get('sun.timeShut') === '1') foldTime(true);
if (mobile) {
  $('rooms').classList.add('shut');
  $('roomsB').setAttribute('aria-expanded', 'false');
}

// ── orbit with inertia: drag turns, wheel and pinch zoom, arrows for the keyboard; the scene drifts slowly until touched ──
const topPx = () => { const a = cv.clientWidth / Math.max(1, cv.clientHeight), hw = Math.max(W * 1.12 / 2, H * 1.12 / 2 * a); return 2 * hw * S.tzoom / Math.max(1, cv.clientWidth); };     // metres per pixel of the view from the top (placeCamera)
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: S.tyaw, pitch: S.tpitch, id: e.pointerId, tx: ttarget.x, tz: ttarget.z }; S.idle = false; $('hint').style.opacity = 0; });
cv.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (S.view === 'top') {                                                                       // from the top a drag moves the view: up to a window to read its sun (remark 57eq: the wheel only went in on the middle)
    const k = topPx(); ttarget.x = drag.tx - (e.clientX - drag.x) * k; ttarget.z = drag.tz - (e.clientY - drag.y) * k; target.x = ttarget.x; target.z = ttarget.z; needs = true; return;
  }
  S.tyaw = drag.yaw - (e.clientX - drag.x) * 0.35; S.tpitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.25, 8, 89);
});
cv.addEventListener('pointerup', () => drag = null); cv.addEventListener('pointercancel', () => drag = null);
cv.addEventListener('wheel', e => {
  e.preventDefault(); S.idle = false; const k = Math.exp(e.deltaY * 0.0012);
  if (S.view === 'top') {                                                                       // towards the point under the pointer: it stays where it is on the screen
    const r = cv.getBoundingClientRect(), m = topPx(), px = ttarget.x + (e.clientX - r.left - r.width / 2) * m, pz = ttarget.z + (e.clientY - r.top - r.height / 2) * m;
    const z1 = clamp(S.tzoom * k, 0.12, 2.5), q = z1 / S.tzoom; S.tzoom = z1; ttarget.x = px + (ttarget.x - px) * q; ttarget.z = pz + (ttarget.z - pz) * q;
  } else { S.tdist = clamp(S.tdist * k, diag * 0.35, diag * 4); if (S.room && k > 1 && S.tdist > diag * 0.9) homeTarget(); }     // zoomed out past the room: back round the flat's middle (tx01, 7mx3)
}, { passive: false });
cv.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
cv.addEventListener('touchmove', e => { if (e.touches.length !== 2 || !pinch) return; const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); const k = pinch / d; pinch = d; if (S.view === 'top') S.tzoom = clamp(S.tzoom * k, 0.12, 2.5); else { S.tdist = clamp(S.tdist * k, diag * 0.35, diag * 4); if (S.room && k > 1 && S.tdist > diag * 0.9) homeTarget(); } }, { passive: true });
cv.addEventListener('touchend', () => pinch = null);
cv.tabIndex = 0;
cv.addEventListener('keydown', e => {
  const k = e.key; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return; e.preventDefault(); S.idle = false;
  if (S.view !== 'top') { if (k === 'ArrowLeft') S.tyaw -= 6; if (k === 'ArrowRight') S.tyaw += 6; if (k === 'ArrowUp') S.tpitch = clamp(S.tpitch + 4, 8, 89); if (k === 'ArrowDown') S.tpitch = clamp(S.tpitch - 4, 8, 89); }
});

// ── room labels follow their rooms ──
const labelsUI = D.rooms.map(r => { const d = document.createElement('div'); d.innerHTML = `${r.name}<small>${ru(r.area_m2)} м²</small>`; $('labels').appendChild(d); return { el: d, room: r, p: new THREE.Vector3(r.label_at[0], 0.02, -r.label_at[1]) }; });
function placeLabels(cam) {
  const w = cv.clientWidth, h = cv.clientHeight, v = new THREE.Vector3();
  for (const l of labelsUI) { v.copy(l.p).project(cam); const vis = v.z < 1; l.el.style.display = vis ? '' : 'none'; if (vis) l.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%,-50%)`; }
}

// ── review: the drawing the model was built from, over the model — on the floor or above the ceiling, see-through (06.11.2026) ──
const OV = { mode: 'floor', op: 0.85, mesh: null, ready: false };                              // the plan on the floor by default (Юрий, 12.11.2026); a viewer's own choice is remembered
try { const s = JSON.parse(localStorage.getItem('ins.overlay') || '{}'); if (s.mode) OV.mode = s.mode; if (s.op) OV.op = s.op; } catch (_) {}
{ const q = new URLSearchParams(location.search).get('overlay'); if (q === 'floor' || q === 'ceil' || q === 'off') OV.mode = q; }
function overlayMesh() {
  if (OV.mesh || !D.png || !D.plan_frame) return OV.mesh;
  const [x0, y0, x1, y1] = D.plan_frame;
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    blending: THREE.MultiplyBlending, premultipliedAlpha: true });     // the drawing darkens what lies under it, in proportion: a patch of sun stays brighter than the shade under the ink too. Laid over it at 0,85 it
                                                                      // levelled sun and shade wherever the plan has hatching, furniture or parquet (Юрий, 11.11.2026)
  OV.mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat);
  OV.mesh.rotation.x = -Math.PI / 2; OV.mesh.position.set((x0 + x1) / 2, 0, -(y0 + y1) / 2); OV.mesh.renderOrder = 4; OV.mesh.visible = false; scene.add(OV.mesh);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, c.width, c.height);
    OV.src = new Uint8ClampedArray(px.data); OV.px = px; OV.g = g;                             // the drawing as read, kept to re-tone it when the strength changes
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); OV.tex = t;
    mat.map = t; mat.needsUpdate = true; OV.ready = true; OV.baked = null; applyOverlay();
  };
  img.src = D.png;
  return OV.mesh;
}
function applyOverlay() {
  const on = OV.mode !== 'off', m = on ? overlayMesh() : OV.mesh;
  if (m) { m.visible = on && OV.ready; m.position.y = OV.mode === 'ceil' ? D.ceiling_m + 0.012 : 0.012; }     // just over the wall tops (nothing above them is drawn: the ceiling, the seal and the
                                                                               // house above write no colour): 15 cm up, the drawing slid off the walls in every oblique view and read as wrong sizes (remark njeh)
  if (on && OV.ready && OV.baked !== OV.op) {                                                  // the drawing's lines alone over the model's own floor (Юрий: «только линии, пол из модели»): the paper, the grey fills,
    const s_ = OV.src, d = OV.px.data, k0 = OV.op;                                              // the furniture's tints and the parquet drop out as white (which multiplies to nothing); the strokes, darker than mid-grey, stay
    for (let i = 0; i < d.length; i += 4) {
      const k = Math.min(1, Math.max(0, (205 - Math.min(s_[i], s_[i + 1], s_[i + 2])) / 115)) * k0;     // with them the floor went dim under the whole sheet; the furniture's grey strokes stay, fainter
      d[i] = 255 - k * (255 - 44); d[i + 1] = 255 - k * (255 - 52); d[i + 2] = 255 - k * (255 - 76); d[i + 3] = 255;     // the strokes in the page's navy
    }
    OV.g.putImageData(OV.px, 0, 0); OV.tex.needsUpdate = true; OV.baked = OV.op;
  }
  document.querySelectorAll('[data-ov]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ov === OV.mode));
  $('ovB').setAttribute('aria-pressed', on);
  try { localStorage.setItem('ins.overlay', JSON.stringify({ mode: OV.mode, op: OV.op })); } catch (_) {}
  needs = true;
}
if (D.png && D.plan_frame) {
  $('ovB').hidden = false; $('ovOp').value = Math.round(OV.op * 100);
  const pop = $('ovPop'), show = v => { pop.hidden = !v; $('ovB').setAttribute('aria-expanded', v); };
  $('ovB').addEventListener('click', () => show(pop.hidden));
  document.querySelectorAll('[data-ov]').forEach(b => b.addEventListener('click', () => { OV.mode = b.dataset.ov; applyOverlay(); }));
  $('ovOp').addEventListener('input', e => { OV.op = e.target.value / 100; if (!OV.raf) OV.raf = requestAnimationFrame(() => { OV.raf = 0; applyOverlay(); }); });     // re-toning the drawing: once a frame
  document.addEventListener('pointerdown', e => { if (!$('tools').contains(e.target)) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') show(false); });
  applyOverlay();
}

// ── frame: everything eases towards its target ──
let last = performance.now();
// ── the model as a file: ASCII FBX 7.4, metres, Z up, the plan's own coordinates (x, y as drawn, z from the floor). One object per element, named, so that an edit made in 3ds Max
// can be read back by name (tools/fbx_diff.py). What only makes shade (the floors above, the rest of the house), the ground and the overlay stay out.
function fbxText() {
  const label = new Map([[M.wall, 'Wall'], [M.head, 'Head'], [M.floor, 'Floor'], [M.ceil, 'Ceiling'], [M.glass, 'Glass'], [M.frame, 'Frame'], [M.door, 'Door']]);
  for (const [m, l] of [[M.metal, 'Metal'], [M.rp, 'RailProfile'], [M.bars, 'Bars']]) if (m) label.set(m, l);
  for (const m of Object.values(M.hoopsOf || {})) label.set(m, 'Bars');
  const inst = [], spread = [];                                                                // the railings' bars are instanced: one object per bar in the file, each where it stands
  scene.traverse(o => { if (o.isInstancedMesh) inst.push(o); });
  for (const im of inst) { const m4 = new THREE.Matrix4(); for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); const m = new THREE.Mesh(im.geometry, im.material); m.name = `${im.name}_${i + 1}`; m.applyMatrix4(m4); im.parent.add(m); spread.push(m); } }
  scene.updateMatrixWorld(true);
  const seen = new Map(), count = new Map(), mats = new Map(), geo = [], mod = [], con = []; let id = 1000000;
  const num = x => { const v = Math.abs(x) < 5e-6 ? 0 : +x.toFixed(5); return String(v); }, v = new THREE.Vector3(), n = new THREE.Vector3();
  scene.traverse(o => {
    const om = Array.isArray(o.material) ? o.material[o.material.length - 1] : o.material;     // a wall with its darker cut on top is still a wall in the file
    if (!o.isMesh || o.isInstancedMesh || !label.has(om)) return;
    const l = label.get(om); let name = o.name;
    if (!name) { const base = o.parent && o.parent.name ? `${o.parent.name}_${l}` : l, c = (count.get(base) || 0) + 1; count.set(base, c); name = `${base}_${c}`; }
    name = name.replace(/[^\w+.-]/g, '_'); const dup = (seen.get(name) || 0) + 1; seen.set(name, dup); if (dup > 1) name += `_${dup}`;
    const g = o.geometry, p = g.attributes.position, nr = g.attributes.normal, ix = g.index, tot = ix ? ix.count : p.count, nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld), flip = o.matrixWorld.determinant() < 0;
    const vs = [], key = new Map(), poly = [], ns = [];
    const corner = i => { const j = ix ? ix.getX(i) : i; v.fromBufferAttribute(p, j).applyMatrix4(o.matrixWorld); const X = v.x, Y = -v.z, Z = v.y, k = `${X.toFixed(4)} ${Y.toFixed(4)} ${Z.toFixed(4)}`; let a = key.get(k); if (a === undefined) { a = vs.length / 3; key.set(k, a); vs.push(num(X), num(Y), num(Z)); } let N = [0, 0, 1]; if (nr) { n.fromBufferAttribute(nr, j).applyMatrix3(nm).normalize(); N = [n.x, -n.z, n.y]; } return [a, N]; };
    for (let t = 0; t + 2 < tot; t += 3) {
      let tri = [corner(t), corner(t + 1), corner(t + 2)]; if (flip) tri = [tri[0], tri[2], tri[1]];
      if (tri[0][0] === tri[1][0] || tri[1][0] === tri[2][0] || tri[0][0] === tri[2][0]) continue;
      poly.push(tri[0][0], tri[1][0], -tri[2][0] - 1); for (const c of tri) ns.push(num(c[1][0]), num(c[1][1]), num(c[1][2]));
    }
    if (!poly.length) return;
    if (!mats.has(l)) mats.set(l, { id: ++id, c: om.color });
    const gi = ++id, mi = ++id;
    geo.push(`\tGeometry: ${gi}, "Geometry::${name}", "Mesh" {\n\t\tVertices: *${vs.length} {\n\t\t\ta: ${vs.join(',')}\n\t\t}\n\t\tPolygonVertexIndex: *${poly.length} {\n\t\t\ta: ${poly.join(',')}\n\t\t}\n\t\tGeometryVersion: 124\n\t\tLayerElementNormal: 0 {\n\t\t\tVersion: 102\n\t\t\tName: ""\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "Direct"\n\t\t\tNormals: *${ns.length} {\n\t\t\t\ta: ${ns.join(',')}\n\t\t\t}\n\t\t}\n\t\tLayerElementMaterial: 0 {\n\t\t\tVersion: 101\n\t\t\tName: ""\n\t\t\tMappingInformationType: "AllSame"\n\t\t\tReferenceInformationType: "IndexToDirect"\n\t\t\tMaterials: *1 {\n\t\t\t\ta: 0\n\t\t\t}\n\t\t}\n\t\tLayer: 0 {\n\t\t\tVersion: 100\n\t\t\tLayerElement:  {\n\t\t\t\tType: "LayerElementNormal"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n\t\t\tLayerElement:  {\n\t\t\t\tType: "LayerElementMaterial"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n\t\t}\n\t}`);
    mod.push(`\tModel: ${mi}, "Model::${name}", "Mesh" {\n\t\tVersion: 232\n\t\tProperties70:  {\n\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,0,0\n\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0\n\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1\n\t\t}\n\t\tShading: T\n\t\tCulling: "CullingOff"\n\t}`);
    con.push(`\tC: "OO",${mi},0`, `\tC: "OO",${gi},${mi}`, `\tC: "OO",${mats.get(l).id},${mi}`);
  });
  for (const m of spread) m.parent.remove(m);
  const mt = [...mats].map(([l, m]) => `\tMaterial: ${m.id}, "Material::${l}", "" {\n\t\tVersion: 102\n\t\tShadingModel: "lambert"\n\t\tMultiLayer: 0\n\t\tProperties70:  {\n\t\t\tP: "DiffuseColor", "Color", "", "A",${m.c.r.toFixed(4)},${m.c.g.toFixed(4)},${m.c.b.toFixed(4)}\n\t\t}\n\t}`);
  const gs = (k, t, st, x) => `\t\tP: "${k}", "${t}", "${st}", "",${x}`;
  return [`; FBX 7.4.0 project file\n; ----------------------------------------------------\n\nFBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n\tCreator: "Photoreal3d insolation"\n}`,
    `GlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n${[gs('UpAxis', 'int', 'Integer', 2), gs('UpAxisSign', 'int', 'Integer', 1), gs('FrontAxis', 'int', 'Integer', 1), gs('FrontAxisSign', 'int', 'Integer', 1), gs('CoordAxis', 'int', 'Integer', 0), gs('CoordAxisSign', 'int', 'Integer', 1), gs('OriginalUpAxis', 'int', 'Integer', 2), gs('OriginalUpAxisSign', 'int', 'Integer', 1), gs('UnitScaleFactor', 'double', 'Number', 100), gs('OriginalUnitScaleFactor', 'double', 'Number', 100)].join('\n')}\n\t}\n}`,
    `Definitions:  {\n\tVersion: 100\n\tCount: ${1 + mod.length * 2 + mt.length}\n\tObjectType: "GlobalSettings" {\n\t\tCount: 1\n\t}\n\tObjectType: "Model" {\n\t\tCount: ${mod.length}\n\t}\n\tObjectType: "Geometry" {\n\t\tCount: ${geo.length}\n\t}\n\tObjectType: "Material" {\n\t\tCount: ${mt.length}\n\t}\n}`,
    `Objects:  {\n${[...geo, ...mod, ...mt].join('\n')}\n}`, `Connections:  {\n${con.join('\n')}\n}`].join('\n\n') + '\n';
}
window.__fbxText = fbxText;
{
  const btn = $('fbxB'), pop = $('fbxPop');
  btn.hidden = false;
  const show = (visible) => {
    pop.hidden = !visible;
    btn.setAttribute('aria-expanded', visible);
  };
  btn.addEventListener('click', () => {
    $('ovPop').hidden = true;
    show(pop.hidden);
  });
  $('ovB').addEventListener('click', () => show(false));
  document.addEventListener('pointerdown', (event) => {
    if (!$('tools').contains(event.target)) show(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') show(false);
  });
  $('fbxGet').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([fbxText()], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = F.id + '.fbx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// ── the edges as a 3D editor draws them: a fine line where the surface turns or a nearer one stands in front of a farther (remark ngeg; Юрий: «подсвети рёбра»).
// From a pass of normals and depth over the picture, not lines on each piece: those drew the seams between the pieces of one wall (at the doors' height on every wall)
const EDGE = { rt: null, mat: new THREE.MeshNormalMaterial(), qcam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), ready: false };
function edgeSetup() {
  const keep = new Set([M.wall, M.head, M.cap, M.frame, M.frameTop, M.frameArc, M.door, M.floor, M.metal, M.rp, M.ghost].filter(Boolean));     // the top rails and the bays' bent
                                                                                               // ones too: left out, the edges of the walls behind them were drawn across them as slits (remarks xkvt, 7wrx)
  scene.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.some(m => keep.has(m))) o.layers.enable(1); });
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  EDGE.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { depthTexture: new THREE.DepthTexture(sz.x, sz.y), depthBuffer: true });
  const sm = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false,
    uniforms: { tN: { value: EDGE.rt.texture }, tD: { value: EDGE.rt.depthTexture }, px: { value: new THREE.Vector2(1 / sz.x, 1 / sz.y) }, cNear: { value: 0.1 }, cFar: { value: 500 }, ortho: { value: 0 }, col: { value: new THREE.Color(TH.edge) }, amt: { value: TH.edgeAmt } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `#include <packing>
      uniform sampler2D tN; uniform sampler2D tD; uniform vec2 px; uniform float cNear; uniform float cFar; uniform float ortho; uniform float amt; uniform vec3 col; varying vec2 vUv;
      float lz(vec2 uv) { float d = texture2D(tD, uv).x; return ortho > 0.5 ? -orthographicDepthToViewZ(d, cNear, cFar) : -perspectiveDepthToViewZ(d, cNear, cFar); }
      float jump(vec3 n0, float z0, vec4 k, vec2 uv) {                                            // how much of an edge lies between this pixel and that one
        if (k.a < 0.5) return 1.0;
        return max(smoothstep(0.012, 0.035, abs(lz(uv) - z0) / max(z0, 0.1)), smoothstep(0.10, 0.30, 1.0 - dot(n0, k.rgb * 2.0 - 1.0)));
      }
      void main() {
        vec4 c = texture2D(tN, vUv); if (c.a < 0.5) { gl_FragColor = vec4(0.0); return; }      // lines on the model's own pixels only
        float zc = lz(vUv); vec3 nc = c.rgb * 2.0 - 1.0; float e = 0.0;
        for (int i = 0; i < 2; i++) {
          vec2 o = i == 0 ? vec2(px.x, 0.0) : vec2(0.0, px.y);
          vec4 a1 = texture2D(tN, vUv + o), b1 = texture2D(tN, vUv - o), a2 = texture2D(tN, vUv + 2.0 * o), b2 = texture2D(tN, vUv - 2.0 * o);
          float za = lz(vUv + o), zb = lz(vUv - o);
          if (a1.a > 0.5 && b1.a > 0.5 && dot(a1.rgb * 2.0 - 1.0, b1.rgb * 2.0 - 1.0) > 0.98 && abs(za - zb) / max(zc, 0.1) < 0.01) continue;     // a lone pixel unlike both its sides: a speck, no edge (it dotted the walls)
          e = max(e, min(jump(nc, zc, a1, vUv + o), jump(nc, zc, a2, vUv + 2.0 * o)));       // an edge goes on past the next pixel; a one-pixel crack or speck does not
          e = max(e, min(jump(nc, zc, b1, vUv - o), jump(nc, zc, b2, vUv - 2.0 * o)));
        }
        gl_FragColor = vec4(col, e * amt);
      }` });
  EDGE.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sm); EDGE.quad.frustumCulled = false; EDGE.scene = new THREE.Scene(); EDGE.scene.add(EDGE.quad); EDGE.ready = true;
}
function edgePass(cam) {
  if (!EDGE.ready) edgeSetup();
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), u = EDGE.quad.material.uniforms;
  if (EDGE.rt.width !== sz.x || EDGE.rt.height !== sz.y) { EDGE.rt.setSize(sz.x, sz.y); u.px.value.set(1 / sz.x, 1 / sz.y); }
  u.cNear.value = cam.near; u.cFar.value = cam.far; u.ortho.value = cam.isOrthographicCamera ? 1 : 0;
  const mask = cam.layers.mask, auto = renderer.shadowMap.autoUpdate, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  cam.layers.set(1); scene.overrideMaterial = EDGE.mat; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(EDGE.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(null); scene.overrideMaterial = null; cam.layers.mask = mask; renderer.shadowMap.autoUpdate = auto; renderer.setClearColor(cc, ca);
  renderer.autoClear = false; renderer.render(EDGE.scene, EDGE.qcam); renderer.autoClear = true;
}
function draw(cam) {                                                         // two passes over the one picture. The floors above and the rest of the house are unseen shade-makers for what is inside the flat; on the open ground
  const seeThrough = new Set();                                              // their shadow looked like nothing casting something (remarks f6ma, 1vdj): the ground is drawn first, with the flat's own shadow only, and the flat over it with all of them
  scene.traverse(o => { if (o.material && o.material.transparent && o.material.visible && o.material !== M.ground) seeThrough.add(o.material); });     // the ground is see-through only at its rim (groundFade): it stays in this pass
  seeThrough.forEach(m => m.visible = false); M.block.visible = false;
  renderer.autoClear = true; renderer.render(scene, cam);
  seeThrough.forEach(m => m.visible = true); M.block.visible = true;
  ground.visible = false; renderer.autoClear = false; renderer.render(scene, cam); ground.visible = true; renderer.autoClear = true;
  edgePass(cam);
}
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (S.playing) { const dl = S.season.daylight || [0, 1440]; S.minutes += dt * 90; if (S.minutes >= dl[1]) { S.minutes = dl[1]; stopPlay(); } slider.value = Math.round(S.minutes); }
  if (S.idle && S.view === '3d' && !S.playing) S.tyaw += dt * 1.2;
  const k = 1 - Math.pow(0.001, dt);
  let moved = false;
  for (const [a, b] of [['yaw', 'tyaw'], ['pitch', 'tpitch'], ['dist', 'tdist'], ['zoom', 'tzoom']]) { const d = S[b] - S[a]; if (Math.abs(d) > 1e-4) { S[a] += d * k; moved = true; } }
  if (target.distanceTo(ttarget) > 1e-3) { target.lerp(ttarget, k); moved = true; }
  const topA = S.view === 'top' ? 0 : Math.max(0, Math.min(1, (68 - S.pitch) / 10));
  if (Math.abs(M.frameTop.opacity - topA) > 1e-3) { M.frameTop.opacity = topA; moved = true; }
  if (M.frameTop.transparent !== topA < 0.999) { M.frameTop.transparent = topA < 0.999; M.frameTop.needsUpdate = true; moved = true; }     // opaque unless fading: drawn with the glass, the bay's top
                                                                                               // frame showed as a flat tint (remark 2sjl)
  if (Math.abs(S.minutes - S.shown) > 0.05) { S.shown += (S.minutes - S.shown) * (1 - Math.pow(0.0005, dt)); if (Math.abs(S.minutes - S.shown) < 0.5) S.shown = S.minutes; updateSun(); moved = true; }
  else if (moved) updateSun();
  if ((!needs && !moved) || S.view === 'plan') return; needs = false;
  const cam = placeCamera(); draw(cam); placeLabels(cam);
}
function groundFade() {                                                                       // the ground's alpha: whole up to the start, none at its rim (diag * 1.7); TH.horizon 1 starts at 0.38 of the rim
  const R = diag * 1.7; M.groundFade.set(R * (1 - 0.62 * TH.horizon) - 0.001, R);
}
function thApply() {                                                                           // the model and the light: the materials as they are, recoloured in place
  thMerge(); thCss(); groundFade();
  const set = (m, c) => { if (m && m.color) m.color.set(c); };
  set(M.wall, TH.wall); set(M.head, TH.head); set(M.cap, TH.cap); set(M.floor, TH.floor); M.floor.opacity = TH.floorA;
  for (const m of [M.frame, M.frameTop, M.frameArc]) set(m, TH.frame);
  set(M.glass, TH.glass); M.glass.opacity = TH.glassA; set(M.door, TH.door);
  for (const m of [M.metal, M.bars, M.rp, ...Object.values(M.hoopsOf || {})]) set(m, TH.rail);
  set(M.outline, TH.accent); if (typeof ray !== 'undefined') set(ray.material, thMix(TH.sun, '#ffffff', 0.15));
  if (EDGE.quad) { EDGE.quad.material.uniforms.col.value.set(TH.edge); EDGE.quad.material.uniforms.amt.value = TH.edgeAmt; }
  SKY.day[0] = TH.sky1; SKY.day[1] = TH.sky2;
  updateSun(); needs = true;
}
async function thLoad() {                                                                      // the site's theme and the variant asked for, fetched; kept for the next page's first frame
  const base = new URL('./theme/', location.href);
  try { const r = await fetch(new URL('current.json', base), { cache: 'no-store' }); TH_L.site = r.ok ? thClean(await r.json()) : {}; thSet('ins.theme.site:' + TH_HOST, TH_L.site); } catch (_) {}
  if (TH_VARID) try { const r = await fetch(new URL(`variants/${TH_VARID}.json`, base), { cache: 'no-store' }); if (r.ok) { TH_L.variant = thClean(await r.json()); thSet('ins.theme.var:' + TH_HOST + ':' + TH_VARID, TH_L.variant); } } catch (_) {}
  thApply(); if (TH_L.editing) thEditor();
}
function thPill() {                                                                            // the editor hidden: a small button brings it back (in this browser only, where it was opened)
  if (document.getElementById('thpill')) return; const b = document.createElement('button'); b.id = 'thpill'; b.className = 'thpill'; b.type = 'button'; b.textContent = 'Оформление';
  b.addEventListener('click', () => { thSet('ins.edit.on:' + TH_HOST, true); TH_L.editing = true; b.remove(); thApply(); thEditor(); }); document.body.appendChild(b);
}
function thEditor() {                                                                          // the panel: every key as a colour or a slider, applied as it moves
  if (document.getElementById('thed')) return;
  const cap = thGet('ins.edit.cap:' + TH_HOST), el = document.createElement('div'); el.id = 'thed'; el.className = 'thed';
  const groups = [...new Set(THEME_KEYS.map(k => k[1]))];
  el.innerHTML = `<header><b>Редактор оформления</b><button type="button" data-a="min" title="Свернуть">${thGet('ins.edit.min') ? '+' : '–'}</button><button type="button" data-a="close" title="Скрыть редактор (вернуть: Сервис → Оформление)">×</button></header>
    <div class="body"><label class="row tg"><span>Подписи комнат</span><input type="checkbox" data-t="labels"${S.labels ? ' checked' : ''}><code></code></label>${groups.map((g, i) => `<details${i < 2 ? ' open' : ''}><summary>${g}</summary>${THEME_KEYS.filter(k => k[1] === g).map(([k, , l, kind, , mn, mx, st]) => kind === 'color'
      ? `<label class="row"><span>${l}</span><input type="color" data-k="${k}"><code data-v="${k}"></code></label>`
      : `<label class="row"><span>${l}</span><input type="range" data-k="${k}" min="${mn}" max="${mx}" step="${st}"><code data-v="${k}"></code></label>`).join('')}</details>`).join('')}
    </div><footer>
      <div class="btns"><button type="button" data-a="reset">Сбросить к сайту</button><button type="button" data-a="dl">Скачать</button><label class="up">Загрузить<input type="file" accept="application/json" hidden></label></div>
      ${cap ? `<div class="btns"><button type="button" class="pri" data-a="var">Сохранить вариант</button><button type="button" class="pri" data-a="site">Применить на сайте</button></div>` : `<p class="note">Правки видны только в этом браузере. Сохранять на сайт можно по ссылке редактора.</p>`}
      <p class="msg" hidden></p><button type="button" class="quit" data-a="quit">Выйти из редактора в этом браузере</button></footer>`;
  document.body.appendChild(el);
  const dock = () => document.documentElement.classList.toggle('editing', !el.classList.contains('min'));     // the page gives the editor its own column; folded, the page is whole again
  if (thGet('ins.edit.min')) el.classList.add('min'); dock();
  const fill = () => { for (const i of el.querySelectorAll('[data-k]')) i.value = TH[i.dataset.k]; for (const c of el.querySelectorAll('[data-v]')) { const v = TH[c.dataset.v]; c.textContent = typeof v === 'number' ? +v.toFixed(2) : v; } };
  fill();
  let t = null;
  el.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.t === 'labels') showLabels(e.target.checked); });     // the old «T» button's switch
  el.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    const kind = THEME_KEYS.find(x => x[0] === k)[3]; TH_L.draft[k] = kind === 'range' ? +e.target.value : e.target.value;
    thApply(); const c = el.querySelector(`[data-v="${k}"]`); if (c) c.textContent = kind === 'range' ? +(+e.target.value).toFixed(2) : e.target.value;
    clearTimeout(t); t = setTimeout(() => thSet('ins.theme.draft:' + TH_HOST, TH_L.draft), 250); });
  const msg = x => { const m = el.querySelector('.msg'); m.textContent = x; m.hidden = !x; };
  const effective = () => Object.assign({}, TH_DEF, TH_L.site, TH_L.variant, TH_L.draft);
  const post = async (key, obj) => { const f = new FormData(); for (const [k, v] of Object.entries(cap.fields)) f.append(k, v); f.append('key', cap.prefix + key);
    f.append('file', new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), 'theme.json'); const r = await fetch(cap.url, { method: 'POST', body: f }); if (!r.ok) throw new Error('хранилище ответило ' + r.status); };
  const stamp = () => { const d = new Date(), p2 = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`; };
  el.addEventListener('click', async e => { const a = e.target.closest('[data-a]'); if (!a) return; const act = a.dataset.a;
    if (act === 'min') { el.classList.toggle('min'); thSet('ins.edit.min', el.classList.contains('min') || null); a.textContent = el.classList.contains('min') ? '+' : '–'; dock(); return; }
    if (act === 'close' || act === 'quit') { thSet('ins.edit.on:' + TH_HOST, null); TH_L.editing = false; el.remove(); document.documentElement.classList.remove('editing'); thApply();
      if (act === 'quit') { thSet('ins.edit.cap:' + TH_HOST, null); thSet('ins.edit.known:' + TH_HOST, null); } return; }     // ×: hidden, back by Сервис → Оформление; «Выйти»: the right forgotten here
    if (act === 'reset') { TH_L.draft = {}; thSet('ins.theme.draft:' + TH_HOST, null); thApply(); fill(); msg(''); return; }
    if (act === 'dl') { const u = URL.createObjectURL(new Blob([JSON.stringify(thClean(effective()), null, 1)], { type: 'application/json' })); const l = document.createElement('a'); l.href = u; l.download = `theme-${stamp()}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); return; }
    try {
      a.disabled = true;
      if (act === 'var') { const id = 'v-' + stamp(); await post(`variants/${id}.json`, thClean(effective()));
        const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '?theme=' + id; try { await navigator.clipboard.writeText(link); } catch (_) {}
        msg(`Вариант сохранён, ссылка скопирована: ${link}`); }
      if (act === 'site') { if (!confirm('Сделать это оформление основным на сайте? Его увидят все посетители. Прошлое сохранится в истории.')) return;
        const cur = thClean(effective()); await post(`history/${stamp()}.json`, Object.assign({}, TH_DEF, TH_L.site)); await post('current.json', cur);
        TH_L.site = cur; thSet('ins.theme.site:' + TH_HOST, cur); TH_L.draft = {}; thSet('ins.theme.draft:' + TH_HOST, null); thApply(); fill(); msg('Применено на сайте. Обновите страницу у других, чтобы увидеть.'); }
    } catch (x) { msg(`Не сохранилось (${x.message || x})`); } finally { a.disabled = false; } });
  el.querySelector('.up input').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
    try { TH_L.draft = thClean(JSON.parse(await f.text())); thSet('ins.theme.draft:' + TH_HOST, TH_L.draft); thApply(); fill(); msg('Загружено'); } catch (_) { msg('Не тот файл'); } });
}
{                                                                                             // the service menu: each item clicks the old button behind it (their popovers and logic stay as they were)
  const btn = $('svcB'), pop = $('svcPop'), show = v => { pop.hidden = !v; btn.setAttribute('aria-expanded', v); };
  const sync = () => pop.querySelectorAll('[data-svc]').forEach(i => { const t = i.dataset.svc; i.hidden = t !== 'theme' && $(t).hidden; });
  btn.addEventListener('click', () => { sync(); const open = pop.hidden; for (const id of ['ovPop', 'fbxPop']) $(id).hidden = true; show(open); });
  pop.addEventListener('click', e => { const i = e.target.closest('[data-svc]'); if (!i) return; show(false); const t = i.dataset.svc;
    if (t === 'theme') { thSet('ins.edit.on:' + TH_HOST, true); TH_L.editing = true; const p_ = document.getElementById('thpill'); if (p_) p_.remove(); thApply(); thEditor(); return; }
    $(t).click(); });
  document.addEventListener('pointerdown', e => { if (!$('tools').contains(e.target)) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') show(false); });
}
thApply(); thLoad();
window.__theme = { TH, apply: thApply };
updateDay(); updateSun(); requestAnimationFrame(frame);
window.__diag = diag;
window.__scene = scene;                                                                       // for the checks (.scratch tools)
window.__pick = (u, v) => { const cam = placeCamera(), rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), cam); return rc.intersectObjects(scene.children, true).filter(h => h.object.visible).slice(0, 4).map(h => [h.object.name, +h.point.x.toFixed(3), +h.point.y.toFixed(3), +(-h.point.z).toFixed(3)]); };     // what stands at a point of the screen (tools: .scratch/pick.py)
window.__cam = (yaw, pitch, dist, tx, ty, tz) => { S.idle = false; S.yaw = S.tyaw = yaw; S.pitch = S.tpitch = pitch; S.dist = S.tdist = dist; if (tx != null) { target.set(tx, tz == null ? 0.5 : tz, -ty); ttarget.copy(target); } needs = true; };     // tz: the height looked at (tools/review_views.py centres a front on the middle of its storey)
window.__sunReady = true;
