const canvas = document.getElementById('sunCanvas');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('.viewer-stage');
const controls = document.getElementById('sunControls');
const dateInput = document.getElementById('dateInput');
const timeRange = document.getElementById('timeRange');
const timeValue = document.getElementById('timeValue');
const playButton = document.getElementById('playButton');
const sunStatus = document.getElementById('sunStatus');
const sunAngles = document.getElementById('sunAngles');
const tabs = [...document.querySelectorAll('.tab[data-view]')];
const seasonButtons = [...document.querySelectorAll('.season-buttons button')];

const siteLocation = {
  latitude: 55.7047,
  longitude: 37.5709,
  timezone: 3,
  northOnPlan: 315
};

const plan = new Image();
plan.src = 'assets/plan.png';

const state = {
  playing: false,
  timer: null,
  mode: 'sun'
};

const floorPolygon = [
  [12, 30], [735, 30], [770, 52], [790, 100], [790, 410],
  [340, 410], [340, 470], [275, 410], [12, 410]
];

const windows = [
  { a: [40, 30], b: [225, 30], normal: [0, -1] },
  { a: [285, 30], b: [475, 30], normal: [0, -1] },
  { a: [535, 30], b: [720, 30], normal: [0, -1] },
  { a: [770, 72], b: [790, 160], normal: [1, 0] },
  { a: [790, 205], b: [790, 385], normal: [1, 0] }
];

const wallSegments = [
  [[12, 30], [12, 410]],
  [[12, 410], [275, 410]],
  [[340, 410], [790, 410]],
  [[790, 165], [790, 410]],
  [[265, 30], [265, 225]],
  [[265, 245], [265, 410]],
  [[12, 243], [180, 243]],
  [[180, 243], [180, 410]],
  [[340, 243], [510, 243]],
  [[380, 243], [380, 410]],
  [[510, 243], [510, 410]],
  [[340, 410], [340, 280]],
  [[275, 410], [275, 300]]
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function degToRad(value) {
  return value * Math.PI / 180;
}

function radToDeg(value) {
  return value * 180 / Math.PI;
}

function dayOfYear(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  return Math.floor((date - start) / 86400000);
}

function solarPosition(date, minutes) {
  const day = dayOfYear(date);
  const hour = minutes / 60;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const equationOfTime = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  const declination =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  const timeOffset = equationOfTime + 4 * siteLocation.longitude - 60 * siteLocation.timezone;
  let trueSolarTime = minutes + timeOffset;
  while (trueSolarTime < 0) trueSolarTime += 1440;
  while (trueSolarTime >= 1440) trueSolarTime -= 1440;

  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const lat = degToRad(siteLocation.latitude);
  const ha = degToRad(hourAngle);
  const cosZenith = clamp(
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(ha),
    -1,
    1
  );
  const zenith = Math.acos(cosZenith);
  const altitude = 90 - radToDeg(zenith);
  const azimuth = (radToDeg(Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)
  )) + 180 + 360) % 360;

  return { altitude, azimuth };
}

function directionLabel(azimuth) {
  const directions = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'];
  return directions[Math.round(azimuth / 45) % 8];
}

function currentDate() {
  const [year, month, day] = dateInput.value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function planSunDirection(azimuth) {
  const angle = degToRad(siteLocation.northOnPlan + azimuth);
  return [Math.sin(angle), -Math.cos(angle)];
}

function getProjection(width, height) {
  const usableW = Math.max(320, width - 100);
  const usableH = Math.max(260, height - 100);
  const scale = Math.min(usableW / 800, usableH / 350);
  const a = scale;
  const b = scale * 0.07;
  const c = -scale * 0.18;
  const d = scale * 0.58;
  const centerX = a * 400 + c * 241;
  const centerY = b * 400 + d * 241;
  return {
    a, b, c, d,
    e: width / 2 - centerX,
    f: height / 2 - centerY + 26,
    wallHeight: clamp(40 * scale, 28, 56)
  };
}

function project(point, projection, z = 0) {
  const [x, y] = point;
  return {
    x: projection.a * x + projection.c * y + projection.e,
    y: projection.b * x + projection.d * y + projection.f - z
  };
}

function drawPolygon(points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function drawGroundShadow(projection) {
  const projected = floorPolygon.map((point) => project(point, projection));
  ctx.save();
  ctx.filter = 'blur(18px)';
  ctx.fillStyle = 'rgba(30, 22, 42, .18)';
  ctx.beginPath();
  projected.forEach((p, i) => i ? ctx.lineTo(p.x + 8, p.y + 30) : ctx.moveTo(p.x + 8, p.y + 30));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function clipFloor() {
  drawPolygon(floorPolygon);
  ctx.clip();
}

function drawLightBeams(sun, sunDir) {
  const altitude = Math.max(2, sun.altitude);
  const ray = [-sunDir[0], -sunDir[1]];
  const length = clamp(95 + 155 / Math.tan(degToRad(altitude)), 100, 430);
  const intensity = clamp((sun.altitude + 2) / 42, 0.12, 0.62);

  windows.forEach((window) => {
    const exposure = window.normal[0] * sunDir[0] + window.normal[1] * sunDir[1];
    if (exposure <= 0.02 || sun.altitude <= 0) return;

    const shift = [ray[0] * length, ray[1] * length];
    const polygon = [
      window.a,
      window.b,
      [window.b[0] + shift[0], window.b[1] + shift[1]],
      [window.a[0] + shift[0], window.a[1] + shift[1]]
    ];

    const midX = (window.a[0] + window.b[0]) / 2;
    const midY = (window.a[1] + window.b[1]) / 2;
    const gradient = ctx.createLinearGradient(midX, midY, midX + shift[0], midY + shift[1]);
    gradient.addColorStop(0, `rgba(255, 223, 150, ${intensity * exposure})`);
    gradient.addColorStop(.45, `rgba(255, 218, 130, ${intensity * exposure * .52})`);
    gradient.addColorStop(1, 'rgba(255, 232, 180, 0)');
    drawPolygon(polygon);
    ctx.fillStyle = gradient;
    ctx.fill();
  });
}

function drawFloorShadows(sun, sunDir) {
  if (sun.altitude <= 0) return;
  const shadowDirection = [-sunDir[0], -sunDir[1]];
  const length = clamp(58 / Math.tan(degToRad(Math.max(4, sun.altitude))), 9, 115);
  ctx.fillStyle = `rgba(40, 30, 52, ${clamp(.34 - sun.altitude / 240, .12, .3)})`;

  wallSegments.forEach(([a, b]) => {
    const offset = [shadowDirection[0] * length, shadowDirection[1] * length];
    drawPolygon([
      a,
      b,
      [b[0] + offset[0], b[1] + offset[1]],
      [a[0] + offset[0], a[1] + offset[1]]
    ]);
    ctx.fill();
  });
}

function drawWallFaces(projection, sunDir, sun) {
  const sortedWalls = [...wallSegments].sort((left, right) => {
    const ly = (left[0][1] + left[1][1]) / 2;
    const ry = (right[0][1] + right[1][1]) / 2;
    return ly - ry;
  });

  sortedWalls.forEach(([a, b]) => {
    const p1 = project(a, projection);
    const p2 = project(b, projection);
    const p1Top = project(a, projection, projection.wallHeight);
    const p2Top = project(b, projection, projection.wallHeight);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const normal = [-dy / length, dx / length];
    const facing = normal[0] * sunDir[0] + normal[1] * sunDir[1];
    const brightness = sun.altitude > 0 ? clamp(.56 + facing * .18, .36, .72) : .34;
    const base = [39, 23, 69];
    const rgb = base.map((value) => Math.round(value + (255 - value) * (brightness - .36) * .26));

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2Top.x, p2Top.y);
    ctx.lineTo(p1Top.x, p1Top.y);
    ctx.closePath();
    ctx.fillStyle = `rgb(${rgb.join(',')})`;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p1Top.x, p1Top.y);
    ctx.lineTo(p2Top.x, p2Top.y);
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function drawSunMarker(width, sun) {
  const x = width - 110;
  const baseY = 95;
  const normalizedAltitude = clamp(sun.altitude / 60, 0, 1);
  const y = baseY - normalizedAltitude * 46;
  ctx.save();
  ctx.shadowColor = 'rgba(247, 194, 82, .8)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = sun.altitude > 0 ? '#f5c969' : '#aaa4af';
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  if (!plan.complete) return;

  const date = currentDate();
  const minutes = Number(timeRange.value);
  const sun = solarPosition(date, minutes);
  const sunDir = planSunDirection(sun.azimuth);
  const projection = getProjection(width, height);

  drawGroundShadow(projection);

  ctx.save();
  ctx.setTransform(
    dpr * projection.a,
    dpr * projection.b,
    dpr * projection.c,
    dpr * projection.d,
    dpr * projection.e,
    dpr * projection.f
  );

  ctx.drawImage(plan, 0, 0, 800, 482.7);

  ctx.save();
  clipFloor();
  const nightAlpha = clamp((8 - sun.altitude) / 22, 0, .56);
  if (nightAlpha > 0) {
    ctx.fillStyle = `rgba(42, 45, 67, ${nightAlpha})`;
    ctx.fillRect(-100, -100, 1000, 800);
  }
  drawLightBeams(sun, sunDir);
  drawFloorShadows(sun, sunDir);
  ctx.restore();
  ctx.restore();

  drawWallFaces(projection, sunDir, sun);
  drawSunMarker(width, sun);

  const roundedAltitude = Math.round(sun.altitude);
  if (sun.altitude > 0) {
    sunStatus.textContent = 'Солнце над горизонтом';
    sunAngles.textContent = `высота ${roundedAltitude}° · ${directionLabel(sun.azimuth)}`;
  } else {
    sunStatus.textContent = 'Солнце за горизонтом';
    sunAngles.textContent = `ночное освещение · ${directionLabel(sun.azimuth)}`;
  }
  timeValue.textContent = formatTime(minutes);
}

function setDate(value) {
  dateInput.value = value;
  seasonButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.date === value));
  render();
}

function stopPlayback() {
  state.playing = false;
  playButton.classList.remove('is-playing');
  if (state.timer) cancelAnimationFrame(state.timer);
  state.timer = null;
}

function playbackFrame() {
  if (!state.playing) return;
  let value = Number(timeRange.value) + 5;
  if (value > Number(timeRange.max)) value = Number(timeRange.min);
  timeRange.value = String(value);
  render();
  state.timer = setTimeout(() => requestAnimationFrame(playbackFrame), 42);
}

playButton.addEventListener('click', () => {
  state.playing = !state.playing;
  playButton.classList.toggle('is-playing', state.playing);
  if (state.playing) playbackFrame();
  else stopPlayback();
});

timeRange.addEventListener('input', render);
dateInput.addEventListener('change', () => setDate(dateInput.value));
seasonButtons.forEach((button) => button.addEventListener('click', () => setDate(button.dataset.date)));

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.view;
    state.mode = mode;
    tabs.forEach((item) => item.classList.toggle('is-active', item === tab));
    stage.dataset.mode = mode;
    controls.hidden = mode !== 'sun';
    if (mode !== 'sun') stopPlayback();
    else render();
  });
});

const resizeObserver = new ResizeObserver(render);
resizeObserver.observe(stage);
plan.addEventListener('load', render);
window.addEventListener('resize', render);
render();
