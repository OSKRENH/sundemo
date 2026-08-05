const canvas = document.getElementById('sceneCanvas');
const floorView = document.getElementById('floorView');
const floorImage = document.getElementById('floorImage');
const timeline = document.getElementById('timeline');
const timeRange = document.getElementById('timeRange');
const timeValue = document.getElementById('timeValue');
const seasonValue = document.getElementById('seasonValue');
const sunStatus = document.getElementById('sunStatus');
const modeTabs = [...document.querySelectorAll('.mode-tab')];
const seasonButtons = [...document.querySelectorAll('.season-button')];
const resetView = document.getElementById('resetView');
const dragHint = document.getElementById('dragHint');
const sunCompass = document.getElementById('sunCompass');
const compassDial = document.getElementById('compassDial');
const compassSun = document.getElementById('compassSun');
const compassClock = document.getElementById('compassClock');
const scene = SunScene.create(canvas);

const INITIAL_YAW = -0.62;
let mode = '3d';
let season = 'summer';
let minutes = 780;
let dragging = false;
let pointerId = null;
let lastX = 0;
let lastY = 0;

function syncCompass(result) {
  const sun = result?.sun || scene.getSun();
  const cameraRotation = (scene.camera.yaw - INITIAL_YAW) * 180 / Math.PI;
  const angle = SunMath.degToRad(sun.azimuth);
  const radius = 43;
  const x = Math.sin(angle) * radius;
  const y = -Math.cos(angle) * radius;
  const z = 5 + SunMath.clamp(sun.altitude, 0, 68) / 68 * 43;

  compassDial.style.setProperty('--dial-rotation', `${cameraRotation}deg`);
  compassDial.style.setProperty('--sun-x', `${x.toFixed(2)}px`);
  compassDial.style.setProperty('--sun-y', `${y.toFixed(2)}px`);
  compassDial.style.setProperty('--sun-z', `${z.toFixed(2)}px`);
  compassSun.classList.toggle('is-below', sun.altitude <= 0);
  compassClock.textContent = SunMath.formatTime(minutes);
}

function readout(result) {
  const sun = result.sun || result;
  timeValue.textContent = SunMath.formatTime(minutes);
  seasonValue.textContent = SunMath.SEASONS[season].label;
  sunStatus.textContent = sun.altitude > 0
    ? `${SunMath.directionLabel(sun.azimuth)} · высота ${Math.round(sun.altitude)}°${result.litWindows ? ` · лучи из ${result.litWindows} ок.` : ''}`
    : `солнце за горизонтом · ${SunMath.directionLabel(sun.azimuth)}`;
  syncCompass(result);
}

function render() {
  const is3d = mode === '3d';
  floorView.hidden = is3d;
  canvas.hidden = !is3d;
  timeline.classList.toggle('is-disabled', !is3d);
  resetView.hidden = !is3d;
  dragHint.hidden = !is3d;
  sunCompass.hidden = !is3d;

  if (is3d) {
    readout(scene.render());
  }
}

function setMode(value) {
  mode = value;
  modeTabs.forEach(button => button.classList.toggle('is-active', button.dataset.mode === value));
  render();
}

function setSeason(value) {
  season = value;
  scene.setSeason(value);
  seasonButtons.forEach(button => button.classList.toggle('is-active', button.dataset.season === value));
  render();
}

modeTabs.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
seasonButtons.forEach(button => button.addEventListener('click', () => setSeason(button.dataset.season)));

timeRange.addEventListener('input', () => {
  minutes = Number(timeRange.value);
  scene.setMinutes(minutes);
  if (mode === '3d') readout(scene.render());
});

resetView.addEventListener('click', () => {
  scene.reset();
  render();
});

canvas.addEventListener('pointerdown', event => {
  if (mode !== '3d') return;
  dragging = true;
  pointerId = event.pointerId;
  lastX = event.clientX;
  lastY = event.clientY;
  dragHint.style.opacity = '0';
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (!dragging || event.pointerId !== pointerId) return;
  scene.camera.yaw += (event.clientX - lastX) * 0.008;
  scene.camera.pitch = SunMath.clamp(
    scene.camera.pitch - (event.clientY - lastY) * 0.0032,
    0.52,
    1.14
  );
  lastX = event.clientX;
  lastY = event.clientY;
  readout(scene.render());
});

function stopDragging(event) {
  if (event.pointerId !== pointerId) return;
  dragging = false;
  pointerId = null;
  try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
}

canvas.addEventListener('pointerup', stopDragging);
canvas.addEventListener('pointercancel', stopDragging);
window.addEventListener('resize', render);

floorImage.addEventListener('error', () => {
  floorImage.src = 'assets/plan.svg';
  floorImage.alt = 'Планировка квартиры №2';
});

timeRange.value = '780';
scene.setMinutes(780);
setSeason('summer');
setMode('3d');
