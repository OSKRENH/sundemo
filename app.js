const canvas = document.getElementById('sceneCanvas');
const ctx = canvas.getContext('2d');
const floorView = document.getElementById('floorView');
const timeRange = document.getElementById('timeRange');
const timeValue = document.getElementById('timeValue');
const seasonValue = document.getElementById('seasonValue');
const sunStatus = document.getElementById('sunStatus');
const compassTime = document.getElementById('compassTime');
const compassText = document.getElementById('compassText');
const sunDot = document.getElementById('sunDot');
const shadowToggle = document.getElementById('shadowToggle');
const modeTabs = [...document.querySelectorAll('.mode-tab')];
const seasonButtons = [...document.querySelectorAll('.season-button')];
const dragHint = document.getElementById('dragHint');
const resetViewButton = document.getElementById('resetViewButton');

const SITE = { latitude: 55.7047, longitude: 37.5709, timezone: 3, northOnPlan: 315 };
const SEASONS = {
  winter: { label: 'Зимнее солнце', date: '2026-12-21' },
  shoulder: { label: 'Весна / осень', date: '2026-03-21' },
  summer: { label: 'Летнее солнце', date: '2026-06-21' }
};

const HEIGHT = 118;
const CENTER = [403, 244];
const OUTER = [
  [20, 32], [74, 32], [228, 32], [268, 32], [446, 32], [486, 32], [642, 32], [748, 96], [780, 182], [780, 410],
  [342, 410], [342, 470], [275, 410], [20, 410]
];

const WALLS = [
  { a:[20,32], b:[40,32], t:18, outer:true },
  { a:[228,32], b:[268,32], t:18, outer:true },
  { a:[446,32], b:[486,32], t:18, outer:true },
  { a:[642,32], b:[665,32], t:18, outer:true },
  { a:[20,32], b:[20,410], t:18, outer:true },
  { a:[780,182], b:[780,410], t:18, outer:true },
  { a:[20,410], b:[275,410], t:18, outer:true },
  { a:[342,410], b:[780,410], t:18, outer:true },
  { a:[342,410], b:[342,470], t:18, outer:true },
  { a:[342,470], b:[275,410], t:18, outer:true },
  { a:[665,32], b:[748,96], t:8, outer:true, skipCaps:true },
  { a:[748,96], b:[780,182], t:8, outer:true, skipCaps:true },
  { a:[248,32], b:[248,218], t:10, outer:false },
  { a:[248,246], b:[248,410], t:10, outer:false },
  { a:[20,244], b:[176,244], t:10, outer:false },
  { a:[176,244], b:[176,410], t:10, outer:false },
  { a:[338,244], b:[510,244], t:10, outer:false },
  { a:[382,244], b:[382,410], t:10, outer:false },
  { a:[510,244], b:[510,410], t:10, outer:false },
  { a:[276,410], b:[276,302], t:10, outer:false },
  { a:[338,410], b:[338,282], t:10, outer:false }
];

const WINDOWS = [
  { a:[40,32], b:[228,32], inward:[0,1], tangent:[1,0] },
  { a:[268,32], b:[446,32], inward:[0,1], tangent:[1,0] },
  { a:[486,32], b:[642,32], inward:[0,1], tangent:[1,0] },
  { a:[665,32], b:[748,96], inward:[-0.55,0.84], tangent:[0.79,0.61] },
  { a:[748,200], b:[780,360], inward:[-1,0], tangent:[0,1] }
];

const state = {
  mode: '3d',
  season: 'shoulder',
  minutes: 720,
  yaw: -0.6,
  pitch: 0.89,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  showShadows: true
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function degToRad(v) { return v * Math.PI / 180; }
function radToDeg(v) { return v * 180 / Math.PI; }
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
function add(a,b) { return [a[0] + b[0], a[1] + b[1]]; }
function sub(a,b) { return [a[0] - b[0], a[1] - b[1]]; }
function mul(v,s) { return [v[0] * s, v[1] * s]; }
function mid(a,b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function perp(v) { return [-v[1], v[0]]; }
function formatTime(m) {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const mi = mm % 60;
  return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
}
function dayOfYear(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  return Math.floor((date - start) / 86400000);
}
function currentDate() {
  const [y,m,d] = SEASONS[state.season].date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function directionLabel(azimuth) {
  const labels = ['север','северо-восток','восток','юго-восток','юг','юго-запад','запад','северо-запад'];
  return labels[Math.round(azimuth / 45) % 8];
}
function solarPosition(date, minutes) {
  const day = dayOfYear(date);
  const hour = minutes / 60;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  let trueSolarTime = minutes + eq + 4 * SITE.longitude - 60 * SITE.timezone;
  while (trueSolarTime < 0) trueSolarTime += 1440;
  while (trueSolarTime >= 1440) trueSolarTime -= 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const lat = degToRad(SITE.latitude);
  const ha = degToRad(hourAngle);
  const cosZen = clamp(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha), -1, 1);
  const zen = Math.acos(cosZen);
  const altitude = 90 - radToDeg(zen);
  const azimuth = (radToDeg(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat))) + 180 + 360) % 360;
  return { altitude, azimuth };
}
function planDirection(azimuth) {
  const angle = degToRad(SITE.northOnPlan + azimuth);
  return norm([Math.sin(angle), -Math.cos(angle)]);
}
function getMetrics() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}
function transformPoint(p, z = 0) {
  const dx = p[0] - CENTER[0];
  const dy = p[1] - CENTER[1];
  const cosY = Math.cos(state.yaw), sinY = Math.sin(state.yaw);
  const cosP = Math.cos(state.pitch), sinP = Math.sin(state.pitch);
  const x1 = dx * cosY - dy * sinY;
  const y1 = dx * sinY + dy * cosY;
  const y2 = y1 * cosP - z * sinP;
  const z2 = y1 * sinP + z * cosP;
  return { x: x1, y: y2, depth: z2 };
}
function project(p, z, metrics) {
  const t = transformPoint(p, z);
  const scale = Math.min((metrics.width - 140) / 980, (metrics.height - 90) / 760);
  const camera = 1250;
  const persp = camera / (camera - t.depth);
  return { x: metrics.width / 2 + t.x * scale * persp, y: metrics.height / 2 + t.y * scale * persp + 4, depth: t.depth };
}
function drawPoly(points, zs, fill, stroke, metrics, blur) {
  const projected = points.map((p, i) => project(p, zs[i], metrics));
  ctx.save();
  if (blur) { ctx.shadowBlur = blur.radius; ctx.shadowColor = blur.color; }
  ctx.beginPath();
  projected.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}
function clipApartment(metrics) {
  const projected = OUTER.map(p => project(p, 1, metrics));
  ctx.beginPath();
  projected.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.clip();
}
function segmentPrism(seg) {
  const dir = norm(sub(seg.b, seg.a));
  const off = mul(perp(dir), seg.t / 2);
  return [add(seg.a, off), add(seg.b, off), sub(seg.b, off), sub(seg.a, off)];
}
function wallFaces(seg) {
  const base = segmentPrism(seg);
  const c1 = seg.outer ? 'rgb(245,245,245)' : 'rgb(248,248,248)';
  const c2 = seg.outer ? 'rgb(236,236,236)' : 'rgb(241,241,241)';
  const c3 = seg.outer ? 'rgb(228,228,228)' : 'rgb(235,235,235)';
  return [
    { pts:[base[0],base[1],base[1],base[0]], zs:[0,0,HEIGHT,HEIGHT], fill:c1, stroke:'rgba(175,175,175,.55)' },
    { pts:[base[1],base[2],base[2],base[1]], zs:[0,0,HEIGHT,HEIGHT], fill:c2, stroke:'rgba(175,175,175,.45)' },
    { pts:[base[2],base[3],base[3],base[2]], zs:[0,0,HEIGHT,HEIGHT], fill:c3, stroke:'rgba(175,175,175,.36)' },
    { pts:[base[0],base[1],base[2],base[3]], zs:[HEIGHT,HEIGHT,HEIGHT,HEIGHT], fill:'rgba(255,255,255,.14)', stroke:'rgba(210,210,210,.25)' }
  ];
}
function drawBackground(sun, metrics) {
  const daylight = clamp((sun.altitude + 12) / 75, 0.18, 1);
  const grad = ctx.createLinearGradient(0, 0, 0, metrics.height);
  grad.addColorStop(0, `rgba(255,255,255,${0.92 * daylight + 0.08})`);
  grad.addColorStop(1, `rgba(226,226,225,${0.88 + (1 - daylight) * 0.12})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, metrics.width, metrics.height);
}
function drawGroundShadow(metrics) {
  const projected = OUTER.map(p => project(p, 0, metrics));
  ctx.save();
  ctx.filter = 'blur(20px)';
  ctx.beginPath();
  projected.forEach((p, i) => i ? ctx.lineTo(p.x + 14, p.y + 18) : ctx.moveTo(p.x + 14, p.y + 18));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.fill();
  ctx.restore();
}
function drawShadows(sun, metrics) {
  if (!state.showShadows || sun.altitude <= 0) return;
  const incoming = mul(planDirection(sun.azimuth), -1);
  const len = clamp((HEIGHT / Math.tan(degToRad(clamp(sun.altitude, 6, 75)))) * 0.85, 18, 125);
  const candidates = WALLS.filter(w => !w.outer)
    .map(w => {
      const dir = norm(sub(w.b, w.a));
      const normal = perp(dir);
      const facing = Math.abs(normal[0] * incoming[0] + normal[1] * incoming[1]);
      const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      return { w, score: facing * length, facing };
    })
    .filter(x => x.score > 45)
    .sort((a,b) => b.score - a.score)
    .slice(0, 3);
  ctx.save();
  clipApartment(metrics);
  for (const { w, facing } of candidates) {
    const shift = mul(incoming, len);
    drawPoly([w.a, w.b, add(w.b, shift), add(w.a, shift)], [1,1,1,1], `rgba(60,60,60,${0.08 + facing * 0.04})`, null, metrics, { radius: 5, color: 'rgba(0,0,0,.10)' });
  }
  ctx.restore();
}
function drawWindows(metrics) {
  for (const win of WINDOWS) {
    drawPoly([win.a, win.b, win.b, win.a], [18,18,96,96], 'rgba(174,211,227,.18)', 'rgba(143,194,219,.85)', metrics);
  }
}
function drawRays(sun, metrics) {
  if (sun.altitude <= 0) return 0;
  const incoming = mul(planDirection(sun.azimuth), -1);
  const distance = clamp(130 + 280 / Math.tan(degToRad(clamp(sun.altitude, 8, 75))), 160, 340);
  const offsets = [-0.32,-0.16,0,0.16,0.32];
  let lit = 0;
  ctx.save();
  clipApartment(metrics);
  for (const win of WINDOWS) {
    const exp = incoming[0] * win.inward[0] + incoming[1] * win.inward[1];
    if (exp <= 0.05) continue;
    lit += 1;
    const tangent = norm(win.tangent);
    const len = Math.hypot(win.b[0] - win.a[0], win.b[1] - win.a[1]);
    const origin = add(mid(win.a, win.b), mul(win.inward, 6));
    const wideEnd = add(origin, mul(incoming, distance * 0.95));
    const wideHalf = clamp(len * 0.48, 25, 85);
    drawPoly([
      add(origin, mul(tangent, -wideHalf)),
      add(origin, mul(tangent, wideHalf)),
      add(wideEnd, mul(tangent, wideHalf * 0.35)),
      add(wideEnd, mul(tangent, -wideHalf * 0.35))
    ], [84,84,3,3], `rgba(245,224,176,${0.035 + exp * 0.04})`, null, metrics, { radius: 16, color: 'rgba(238,206,125,.18)' });
    for (const off of offsets) {
      const start = add(add(mid(win.a, win.b), mul(tangent, len * off)), mul(win.inward, 8));
      const end = add(start, mul(incoming, distance * (1 - Math.abs(off) * 0.08)));
      const sw = clamp(len * 0.13, 8, 22);
      const ew = sw * 0.42;
      drawPoly([
        add(start, mul(tangent, -sw)),
        add(start, mul(tangent, sw)),
        add(end, mul(tangent, ew)),
        add(end, mul(tangent, -ew))
      ], [82,82,2,2], `rgba(247,225,179,${0.055 + exp * 0.06})`, null, metrics, { radius: 8, color: 'rgba(238,206,125,.22)' });
    }
  }
  ctx.restore();
  return lit;
}
function render() {
  const metrics = getMetrics();
  ctx.clearRect(0, 0, metrics.width, metrics.height);
  if (state.mode !== '3d') return;
  const sun = solarPosition(currentDate(), state.minutes);
  drawBackground(sun, metrics);
  drawGroundShadow(metrics);
  drawPoly(OUTER, Array(OUTER.length).fill(0), 'rgba(255,255,255,.22)', 'rgba(165,165,165,.18)', metrics);
  drawShadows(sun, metrics);
  const faces = [];
  for (const wall of WALLS) {
    for (const face of wallFaces(wall)) {
      const depth = face.pts.reduce((sum, p, i) => sum + transformPoint(p, face.zs[i]).depth, 0) / face.pts.length;
      faces.push({ ...face, depth });
    }
  }
  faces.sort((a,b) => a.depth - b.depth);
  faces.forEach(f => drawPoly(f.pts, f.zs, f.fill, f.stroke, metrics));
  drawWindows(metrics);
  const litWindows = drawRays(sun, metrics);
  drawPoly(OUTER, Array(OUTER.length).fill(HEIGHT), 'rgba(255,255,255,.025)', 'rgba(220,220,220,.10)', metrics);
  updateUI(sun, litWindows);
}
function updateUI(sun, litWindows) {
  const time = formatTime(state.minutes);
  timeValue.textContent = time;
  seasonValue.textContent = SEASONS[state.season].label;
  const altitudeText = Math.round(sun.altitude);
  sunStatus.textContent = sun.altitude > 0
    ? `Азимут ${Math.round(sun.azimuth)}° · ${directionLabel(sun.azimuth)} · высота ${altitudeText}° · лучи из ${litWindows} окон`
    : `Солнце за горизонтом · ${directionLabel(sun.azimuth)} · высота ${altitudeText}°`;
  compassTime.textContent = time;
  compassText.textContent = sun.altitude > 0 ? `${directionLabel(sun.azimuth)} · ${altitudeText}°` : 'солнце за горизонтом';
  const angle = degToRad(sun.azimuth);
  const radius = 33;
  const vertical = clamp(1 - (sun.altitude + 5) / 75, 0.4, 1.2);
  const dx = Math.sin(angle) * radius;
  const dy = -Math.cos(angle) * radius * vertical;
  sunDot.style.transform = `translate(${dx}px, ${dy}px)`;
  sunDot.style.opacity = sun.altitude > 0 ? '1' : '.35';
}
function setMode(mode) {
  state.mode = mode;
  modeTabs.forEach(btn => btn.classList.toggle('is-active', btn.dataset.mode === mode));
  const is3d = mode === '3d';
  floorView.hidden = is3d;
  canvas.hidden = !is3d;
  dragHint.hidden = !is3d;
  if (is3d) render();
}
function setSeason(season) {
  state.season = season;
  seasonButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.season === season));
  render();
}
modeTabs.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
seasonButtons.forEach(btn => btn.addEventListener('click', () => setSeason(btn.dataset.season)));
shadowToggle.addEventListener('change', () => { state.showShadows = shadowToggle.checked; render(); });
timeRange.addEventListener('input', () => { state.minutes = Number(timeRange.value); render(); });
resetViewButton.addEventListener('click', () => { state.yaw = -0.6; state.pitch = 0.89; render(); });
canvas.addEventListener('pointerdown', event => {
  if (state.mode !== '3d') return;
  state.dragging = true;
  state.pointerId = event.pointerId;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  dragHint.style.opacity = '0';
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  state.yaw += (event.clientX - state.lastX) * 0.008;
  state.pitch = clamp(state.pitch - (event.clientY - state.lastY) * 0.0034, 0.56, 1.18);
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  render();
});
function stopDrag(event) {
  if (event.pointerId !== state.pointerId) return;
  state.dragging = false;
  state.pointerId = null;
  try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
}
canvas.addEventListener('pointerup', stopDrag);
canvas.addEventListener('pointercancel', stopDrag);
canvas.addEventListener('pointerleave', stopDrag);
window.addEventListener('resize', render);
render();
