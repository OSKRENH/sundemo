const canvas = document.getElementById('sceneCanvas');
const ctx = canvas.getContext('2d');
const floorView = document.getElementById('floorView');
const timeRange = document.getElementById('timeRange');
const timeValue = document.getElementById('timeValue');
const seasonValue = document.getElementById('seasonValue');
const sunStatus = document.getElementById('sunStatus');
const seasonButtons = [...document.querySelectorAll('.season-button')];
const modeTabs = [...document.querySelectorAll('.mode-tab')];
const sunControls = document.getElementById('sunControls');
const fullscreenButton = document.getElementById('fullscreenButton');
const dragHint = document.getElementById('dragHint');

const siteLocation = {
  latitude: 55.7047,
  longitude: 37.5709,
  timezone: 3,
  northOnPlan: 315
};

const seasonConfig = {
  winter: { label: 'Зимнее солнце', date: '2026-12-21' },
  shoulder: { label: 'Весна / осень', date: '2026-03-21' },
  summer: { label: 'Летнее солнце', date: '2026-06-21' }
};

const wallHeight = 118;
const center = [401, 242];
const outerPolygon = [
  [12, 30], [735, 30], [770, 52], [790, 100], [790, 410],
  [340, 410], [340, 470], [275, 410], [12, 410]
];

const walls = [
  { a: [12, 30], b: [735, 30], thickness: 18, outer: true },
  { a: [735, 30], b: [770, 52], thickness: 18, outer: true },
  { a: [770, 52], b: [790, 100], thickness: 18, outer: true },
  { a: [790, 100], b: [790, 410], thickness: 18, outer: true },
  { a: [790, 410], b: [340, 410], thickness: 18, outer: true },
  { a: [340, 410], b: [340, 470], thickness: 18, outer: true },
  { a: [340, 470], b: [275, 410], thickness: 18, outer: true },
  { a: [275, 410], b: [12, 410], thickness: 18, outer: true },
  { a: [12, 410], b: [12, 30], thickness: 18, outer: true },

  { a: [266, 30], b: [266, 225], thickness: 10, outer: false },
  { a: [266, 245], b: [266, 410], thickness: 10, outer: false },
  { a: [12, 243], b: [180, 243], thickness: 10, outer: false },
  { a: [180, 243], b: [180, 410], thickness: 10, outer: false },
  { a: [340, 243], b: [510, 243], thickness: 10, outer: false },
  { a: [380, 243], b: [380, 410], thickness: 10, outer: false },
  { a: [510, 243], b: [510, 410], thickness: 10, outer: false },
  { a: [340, 410], b: [340, 282], thickness: 10, outer: false },
  { a: [275, 410], b: [275, 302], thickness: 10, outer: false }
];

const windows = [
  { a: [42, 30], b: [226, 30], inward: [0, 1], tangent: [1, 0], wallType: 'top' },
  { a: [288, 30], b: [474, 30], inward: [0, 1], tangent: [1, 0], wallType: 'top' },
  { a: [536, 30], b: [720, 30], inward: [0, 1], tangent: [1, 0], wallType: 'top' },
  { a: [790, 208], b: [790, 386], inward: [-1, 0], tangent: [0, 1], wallType: 'right' }
];

const state = {
  mode: '3d',
  season: 'summer',
  minutes: 720,
  yaw: -0.7,
  pitch: -0.88,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  hintShown: true
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function degToRad(value) {
  return value * Math.PI / 180;
}

function radToDeg(value) {
  return value * 180 / Math.PI;
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1]) || 1;
  return [vector[0] / length, vector[1] / length];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function scale(vector, amount) {
  return [vector[0] * amount, vector[1] * amount];
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function perpendicular(vector) {
  return [-vector[1], vector[0]];
}

function formatTime(totalMinutes) {
  const value = totalMinutes % 1440;
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function directionLabel(azimuth) {
  const directions = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'];
  return directions[Math.round(azimuth / 45) % 8];
}

function dayOfYear(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  return Math.floor((date - start) / 86400000);
}

function currentDate() {
  const config = seasonConfig[state.season];
  const [year, month, day] = config.date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
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

function planSunDirection(azimuth) {
  const angle = degToRad(siteLocation.northOnPlan + azimuth);
  return normalize([Math.sin(angle), -Math.cos(angle)]);
}

function getCanvasMetrics() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function transformPoint(point, z, yaw = state.yaw, pitch = state.pitch) {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const x1 = dx * cosYaw - dy * sinYaw;
  const y1 = dx * sinYaw + dy * cosYaw;
  const y2 = y1 * cosPitch - z * sinPitch;
  const z2 = y1 * sinPitch + z * cosPitch;

  return { x: x1, y: y2, depth: z2 };
}

function project(point, metrics, z = 0) {
  const t = transformPoint(point, z);
  const sceneScale = Math.min((metrics.width - 120) / 940, (metrics.height - 100) / 780);
  const cameraDistance = 1250;
  const perspective = cameraDistance / (cameraDistance - t.depth);
  return {
    x: metrics.width / 2 + t.x * sceneScale * perspective,
    y: metrics.height / 2 + t.y * sceneScale * perspective + 18,
    depth: t.depth
  };
}

function polygonDepth(points, z = 0) {
  const sum = points.reduce((total, point) => total + transformPoint(point, z).depth, 0);
  return sum / points.length;
}

function prismFromSegment(segment) {
  const direction = normalize([segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]]);
  const offset = scale(perpendicular(direction), segment.thickness / 2);
  const p1 = add(segment.a, offset);
  const p2 = add(segment.b, offset);
  const p3 = add(segment.b, scale(offset, -1));
  const p4 = add(segment.a, scale(offset, -1));
  return { bottom: [p1, p2, p3, p4], top: [p1, p2, p3, p4] };
}

function makeWallFaces(segment) {
  const prism = prismFromSegment(segment);
  const baseColor = segment.outer ? [244, 244, 244] : [250, 250, 250];
  const topColor = segment.outer ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.18)';

  return [
    {
      points: [prism.bottom[0], prism.bottom[1], prism.top[1], prism.top[0]],
      zs: [0, 0, wallHeight, wallHeight],
      fill: shadeColor(baseColor, .94),
      stroke: 'rgba(160,160,160,.55)'
    },
    {
      points: [prism.bottom[1], prism.bottom[2], prism.top[2], prism.top[1]],
      zs: [0, 0, wallHeight, wallHeight],
      fill: shadeColor(baseColor, .86),
      stroke: 'rgba(160,160,160,.44)'
    },
    {
      points: [prism.bottom[2], prism.bottom[3], prism.top[3], prism.top[2]],
      zs: [0, 0, wallHeight, wallHeight],
      fill: shadeColor(baseColor, .8),
      stroke: 'rgba(160,160,160,.34)'
    },
    {
      points: prism.top,
      zs: [wallHeight, wallHeight, wallHeight, wallHeight],
      fill: topColor,
      stroke: 'rgba(195,195,195,.3)'
    }
  ];
}

function shadeColor(rgb, factor) {
  return `rgb(${rgb.map((value) => Math.round(value * factor)).join(',')})`;
}

function drawProjectedPolygon(points, zs, fill, stroke, metrics, shadow = null) {
  const projected = points.map((point, index) => project(point, metrics, zs[index]));
  ctx.save();
  if (shadow) {
    ctx.shadowBlur = shadow.blur;
    ctx.shadowColor = shadow.color;
  }
  ctx.beginPath();
  projected.forEach((p, index) => {
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi + 0.00001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function createEllipsePolygon(centerPoint, majorAxis, minorAxis, radiusA, radiusB, steps = 26) {
  const major = normalize(majorAxis);
  const minor = normalize(minorAxis);
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    const point = add(
      add(centerPoint, scale(major, Math.cos(angle) * radiusA)),
      scale(minor, Math.sin(angle) * radiusB)
    );
    points.push(point);
  }
  return points;
}

function drawLightSpots(sun, metrics) {
  if (sun.altitude <= 0) return;
  const sunDir = planSunDirection(sun.azimuth);
  const incoming = scale(sunDir, -1);
  const altitude = clamp(sun.altitude, 5, 75);
  const distance = clamp(36 + 205 / Math.tan(degToRad(altitude)), 48, 210);
  const floorRadiusA = clamp(110 - altitude * 0.8, 36, 96);
  const floorRadiusB = clamp(34 + altitude * 0.18, 24, 48);
  const baseIntensity = clamp(0.16 + sun.altitude / 200, 0.16, 0.34);

  windows.forEach((window) => {
    const exposure = incoming[0] * window.inward[0] + incoming[1] * window.inward[1];
    if (exposure <= 0.12) return;

    const start = midpoint(window.a, window.b);
    const spotCenter = add(start, scale(window.inward, 22 + distance * 0.1));
    const floorCenter = add(spotCenter, scale(incoming, distance * 0.56));

    if (pointInPolygon(floorCenter, outerPolygon)) {
      const ellipse = createEllipsePolygon(
        floorCenter,
        incoming,
        perpendicular(incoming),
        floorRadiusA,
        floorRadiusB
      );
      drawProjectedPolygon(
        ellipse,
        new Array(ellipse.length).fill(2),
        `rgba(245, 207, 125, ${baseIntensity * exposure})`,
        null,
        metrics,
        { blur: 18, color: 'rgba(243, 200, 109, 0.38)' }
      );
    }

    const tangentInfluence = incoming[0] * window.tangent[0] + incoming[1] * window.tangent[1];
    const slide = tangentInfluence * 46;
    const patchWidth = 32;
    const zBottom = 18;
    const zTop = clamp(66 + sun.altitude * 0.45, 78, 102);

    let wallPatch;
    if (window.wallType === 'top') {
      const centerX = clamp(start[0] + slide, Math.min(window.a[0], window.b[0]) + 22, Math.max(window.a[0], window.b[0]) - 22);
      wallPatch = {
        points: [[centerX - patchWidth, 38], [centerX + patchWidth, 38], [centerX + patchWidth, 38], [centerX - patchWidth, 38]],
        zs: [zBottom, zBottom, zTop, zTop]
      };
    } else {
      const centerY = clamp(start[1] + slide, Math.min(window.a[1], window.b[1]) + 22, Math.max(window.a[1], window.b[1]) - 22);
      wallPatch = {
        points: [[782, centerY - patchWidth], [782, centerY + patchWidth], [782, centerY + patchWidth], [782, centerY - patchWidth]],
        zs: [zBottom, zBottom, zTop, zTop]
      };
    }

    drawProjectedPolygon(
      wallPatch.points,
      wallPatch.zs,
      `rgba(248, 221, 156, ${0.24 * exposure})`,
      null,
      metrics,
      { blur: 12, color: 'rgba(243, 200, 109, 0.42)' }
    );
  });
}

function drawGroundShadow(metrics) {
  const projected = outerPolygon.map((point) => project(point, metrics, 0));
  ctx.save();
  ctx.filter = 'blur(22px)';
  ctx.fillStyle = 'rgba(0,0,0,.10)';
  ctx.beginPath();
  projected.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x + 16, point.y + 18);
    else ctx.lineTo(point.x + 16, point.y + 18);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawScene() {
  const metrics = getCanvasMetrics();
  ctx.clearRect(0, 0, metrics.width, metrics.height);

  if (state.mode !== '3d') return;

  const date = currentDate();
  const sun = solarPosition(date, state.minutes);
  const background = ctx.createLinearGradient(0, 0, 0, metrics.height);
  const daylight = clamp((sun.altitude + 10) / 75, 0.12, 1);
  background.addColorStop(0, `rgba(255,255,255,${0.88 * daylight})`);
  background.addColorStop(1, `rgba(214,214,214,${0.72 + (1 - daylight) * 0.24})`);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, metrics.width, metrics.height);
  drawGroundShadow(metrics);

  const faces = [];
  faces.push({
    points: outerPolygon,
    zs: new Array(outerPolygon.length).fill(0),
    fill: 'rgba(255,255,255,0.22)',
    stroke: 'rgba(160,160,160,.2)',
    depth: polygonDepth(outerPolygon, 0)
  });

  faces.push({
    points: outerPolygon,
    zs: new Array(outerPolygon.length).fill(wallHeight),
    fill: 'rgba(255,255,255,0.08)',
    stroke: 'rgba(220,220,220,.18)',
    depth: polygonDepth(outerPolygon, wallHeight)
  });

  walls.forEach((wall) => {
    makeWallFaces(wall).forEach((face) => {
      const depth = face.points.reduce((total, point, index) => total + transformPoint(point, face.zs[index]).depth, 0) / face.points.length;
      faces.push({ ...face, depth });
    });
  });

  faces.sort((a, b) => a.depth - b.depth);
  faces.forEach((face) => drawProjectedPolygon(face.points, face.zs, face.fill, face.stroke, metrics));
  drawLightSpots(sun, metrics);
  updateReadout(sun);
}

function updateReadout(sun) {
  timeValue.textContent = formatTime(state.minutes);
  seasonValue.textContent = seasonConfig[state.season].label;

  if (sun.altitude > 0) {
    sunStatus.textContent = `Азимут ${Math.round(sun.azimuth)}° · ${directionLabel(sun.azimuth)} · высота ${Math.round(sun.altitude)}°`;
  } else {
    sunStatus.textContent = `Солнце за горизонтом · ${directionLabel(sun.azimuth)} · высота ${Math.round(sun.altitude)}°`;
  }
}

function render() {
  floorView.hidden = state.mode !== '2d';
  canvas.style.opacity = state.mode === '3d' ? '1' : '0';
  sunControls.hidden = state.mode !== '3d';
  dragHint.style.opacity = state.mode === '3d' && state.hintShown ? '1' : '0';
  drawScene();
}

function setMode(mode) {
  state.mode = mode;
  modeTabs.forEach((button) => button.classList.toggle('is-active', button.dataset.mode === mode));
  render();
}

function setSeason(season) {
  state.season = season;
  seasonButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.season === season));
  render();
}

function handlePointerDown(event) {
  if (state.mode !== '3d') return;
  state.dragging = true;
  state.pointerId = event.pointerId;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  state.hintShown = false;
  dragHint.style.opacity = '0';
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.lastX;
  const dy = event.clientY - state.lastY;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  state.yaw += dx * 0.0085;
  state.pitch = clamp(state.pitch + dy * 0.0035, -1.18, -0.52);
  render();
}

function handlePointerUp(event) {
  if (event.pointerId !== state.pointerId) return;
  state.dragging = false;
  canvas.releasePointerCapture(event.pointerId);
  state.pointerId = null;
}

function toggleFullscreen() {
  const target = document.querySelector('.stage-center');
  if (!document.fullscreenElement) {
    target.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

modeTabs.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

seasonButtons.forEach((button) => {
  button.addEventListener('click', () => setSeason(button.dataset.season));
});

timeRange.addEventListener('input', () => {
  state.minutes = Number(timeRange.value);
  render();
});

canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);
canvas.addEventListener('pointerleave', handlePointerUp);
fullscreenButton.addEventListener('click', toggleFullscreen);
window.addEventListener('resize', render);

document.addEventListener('fullscreenchange', render);

setSeason('summer');
setMode('3d');
render();
