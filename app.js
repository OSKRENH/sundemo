import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const mount = document.getElementById('threeMount');
const stage = document.getElementById('viewerStage');
const planView = document.getElementById('planView');
const sunPanel = document.getElementById('sunPanel');
const timeRange = document.getElementById('timeRange');
const timeValue = document.getElementById('timeValue');
const sunCaption = document.getElementById('sunCaption');
const sunPosition = document.getElementById('sunPosition');
const compassSun = document.getElementById('compassSun');
const roomChip = document.getElementById('roomChip');
const interactionHint = document.getElementById('interactionHint');
const modeButtons = [...document.querySelectorAll('.mode-button')];
const seasonButtons = [...document.querySelectorAll('.date-switch button')];
const resetButton = document.getElementById('resetButton');
const fullscreenButton = document.getElementById('fullscreenButton');

const SITE = { latitude: 55.7047, longitude: 37.5709, timezone: 3, northOnPlan: 315 };
const SEASONS = {
  winter: { label: '21 декабря', date: '2026-12-21' },
  shoulder: { label: '21 марта', date: '2026-03-21' },
  summer: { label: '21 июня', date: '2026-06-21' }
};
const PLAN_CENTER = [401, 242];
const PLAN_SCALE = 0.018;
const WALL_HEIGHT = 3.05;
const OUTER = [[12,30],[735,30],[770,52],[790,100],[790,410],[340,410],[340,470],[275,410],[12,410]];
const WALLS = [
  [[12,30],[42,30],18,true],[[226,30],[288,30],18,true],[[474,30],[536,30],18,true],
  [[720,30],[735,30],18,true],[[790,100],[790,208],18,true],[[790,386],[790,410],18,true],
  [[790,410],[340,410],18,true],[[340,410],[340,470],18,true],[[340,470],[275,410],18,true],
  [[275,410],[12,410],18,true],[[12,410],[12,30],18,true],
  [[266,30],[266,225],10,false],[[266,245],[266,410],10,false],[[12,243],[180,243],10,false],
  [[180,243],[180,410],10,false],[[340,243],[510,243],10,false],[[380,243],[380,410],10,false],
  [[510,243],[510,410],10,false],[[340,410],[340,282],10,false],[[275,410],[275,302],10,false]
].map(([a,b,thickness,outer]) => ({ a,b,thickness,outer }));
const WINDOWS = [
  [[42,30],[226,30]],[[288,30],[474,30]],[[536,30],[720,30]],
  [[735,30],[770,52]],[[770,52],[790,100]],[[790,208],[790,386]]
].map(([a,b]) => ({ a,b }));
const state = { mode: '3d', season: 'shoulder', minutes: 780 };

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog(0xf2f2f0, 20, 36);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(11.7, 11.2, 14.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.2, 0.72, 0.15);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 8;
controls.maxDistance = 28;
controls.minPolarAngle = THREE.MathUtils.degToRad(27);
controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.saveState();

const apartment = new THREE.Group();
scene.add(apartment);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f4f0, roughness: 0.94, metalness: 0, transparent: true, opacity: 0.98, side: THREE.DoubleSide });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9, metalness: 0 });
const outerWallMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f3f2, roughness: 0.92, metalness: 0 });
const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.85, metalness: 0 });
const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb9d9e4, roughness: 0.08, metalness: 0, transmission: 0.35, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xcacac7, transparent: true, opacity: 0.48 });

function planToWorld(point) {
  return new THREE.Vector3((point[0] - PLAN_CENTER[0]) * PLAN_SCALE, 0, (point[1] - PLAN_CENTER[1]) * PLAN_SCALE);
}
function floorShape() {
  const shape = new THREE.Shape();
  OUTER.forEach((point, index) => {
    const x = (point[0] - PLAN_CENTER[0]) * PLAN_SCALE;
    const y = -(point[1] - PLAN_CENTER[1]) * PLAN_SCALE;
    if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}
function createFloor() {
  const geometry = new THREE.ShapeGeometry(floorShape());
  geometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(geometry, floorMaterial);
  floor.receiveShadow = true;
  apartment.add(floor);
  const underside = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 1 }));
  underside.position.y = -0.11;
  underside.receiveShadow = true;
  apartment.add(underside);
  const blockerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(geometry.clone(), blockerMaterial);
  ceiling.position.y = WALL_HEIGHT;
  ceiling.castShadow = true;
  apartment.add(ceiling);
}
function createBoxAlongSegment(a, b, thickness, height, material, y = height / 2) {
  const start = planToWorld(a);
  const end = planToWorld(b);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness * PLAN_SCALE), material);
  mesh.position.set((start.x + end.x) / 2, y, (start.z + end.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function addEdges(mesh) {
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 24), edgeMaterial));
}
function createWalls() {
  WALLS.forEach((wall) => {
    const mesh = createBoxAlongSegment(wall.a, wall.b, wall.thickness, WALL_HEIGHT, wall.outer ? outerWallMaterial : wallMaterial);
    addEdges(mesh);
    apartment.add(mesh);
  });
}
function createWindow(windowSegment) {
  const start = planToWorld(windowSegment.a);
  const end = planToWorld(windowSegment.b);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const angle = -Math.atan2(dz, dx);
  const sill = 0.36;
  const height = 2.34;
  const depth = 0.045;
  const frame = 0.075;
  const group = new THREE.Group();
  group.position.set((start.x + end.x) / 2, 0, (start.z + end.z) / 2);
  group.rotation.y = angle;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.08, length - frame * 2), height, depth), glassMaterial);
  glass.position.y = sill + height / 2;
  glass.renderOrder = 2;
  group.add(glass);
  const horizontalGeometry = new THREE.BoxGeometry(length, frame, depth * 1.8);
  const bottom = new THREE.Mesh(horizontalGeometry, frameMaterial);
  bottom.position.y = sill;
  bottom.castShadow = true;
  group.add(bottom);
  const top = bottom.clone();
  top.position.y = sill + height;
  group.add(top);
  const verticalGeometry = new THREE.BoxGeometry(frame, height + frame, depth * 1.8);
  const left = new THREE.Mesh(verticalGeometry, frameMaterial);
  left.position.set(-length / 2 + frame / 2, sill + height / 2, 0);
  left.castShadow = true;
  group.add(left);
  const right = left.clone();
  right.position.x = length / 2 - frame / 2;
  group.add(right);
  const mullionCount = length > 3.2 ? 2 : length > 1.7 ? 1 : 0;
  for (let index = 1; index <= mullionCount; index += 1) {
    const mullion = new THREE.Mesh(verticalGeometry, frameMaterial);
    mullion.position.set(-length / 2 + (length * index) / (mullionCount + 1), sill + height / 2, 0);
    mullion.castShadow = true;
    group.add(mullion);
  }
  apartment.add(group);
}
function createGround() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.11 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.13;
  ground.receiveShadow = true;
  scene.add(ground);
}
createFloor();
createWalls();
WINDOWS.forEach(createWindow);
createGround();

const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd4d2cd, 2.15);
scene.add(hemisphere);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.25);
fillLight.position.set(-8, 12, 8);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xdde6ec, 0.45);
rimLight.position.set(7, 6, -10);
scene.add(rimLight);
const sunLight = new THREE.DirectionalLight(0xfff1c7, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -14;
sunLight.shadow.camera.right = 14;
sunLight.shadow.camera.top = 14;
sunLight.shadow.camera.bottom = -14;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 45;
sunLight.shadow.bias = -0.00035;
sunLight.shadow.normalBias = 0.035;
sunLight.target.position.set(0, 0.6, 0);
scene.add(sunLight, sunLight.target);

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function degToRad(value) { return value * Math.PI / 180; }
function radToDeg(value) { return value * 180 / Math.PI; }
function dayOfYear(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  return Math.floor((date - start) / 86400000);
}
function dateForSeason() {
  const [year, month, day] = SEASONS[state.season].date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
function solarPosition(date, minutes) {
  const day = dayOfYear(date);
  const hour = minutes / 60;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  let solarTime = minutes + equationOfTime + 4 * SITE.longitude - 60 * SITE.timezone;
  while (solarTime < 0) solarTime += 1440;
  while (solarTime >= 1440) solarTime -= 1440;
  let hourAngle = solarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const latitude = degToRad(SITE.latitude);
  const hourAngleRad = degToRad(hourAngle);
  const cosZenith = clamp(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngleRad), -1, 1);
  const altitude = 90 - radToDeg(Math.acos(cosZenith));
  const azimuth = (radToDeg(Math.atan2(Math.sin(hourAngleRad), Math.cos(hourAngleRad) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude))) + 540) % 360;
  return { altitude, azimuth };
}
function formatTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
function directionLabel(azimuth) {
  const labels = ['Север','Северо-восток','Восток','Юго-восток','Юг','Юго-запад','Запад','Северо-запад'];
  return labels[Math.round(azimuth / 45) % 8];
}
function updateSun() {
  const sun = solarPosition(dateForSeason(), state.minutes);
  const altitude = degToRad(Math.max(sun.altitude, 0));
  const planAngle = degToRad(SITE.northOnPlan + sun.azimuth);
  const horizontal = Math.cos(altitude);
  const distance = 22;
  sunLight.position.set(Math.sin(planAngle) * horizontal * distance, Math.max(0.35, Math.sin(altitude) * distance), -Math.cos(planAngle) * horizontal * distance);
  sunLight.intensity = state.mode === 'sun' && sun.altitude > -1 ? clamp(2.4 + sun.altitude / 18, 2.4, 5.8) : 0;
  sunLight.color.set(sun.altitude < 12 ? 0xffd39a : 0xfff1c7);
  sunLight.shadow.needsUpdate = true;
  const ambientDaylight = clamp((sun.altitude + 8) / 60, 0.16, 1);
  if (state.mode === 'sun') {
    hemisphere.intensity = 0.42 + ambientDaylight * 0.32;
    fillLight.intensity = 0.12;
    rimLight.intensity = 0.08;
    renderer.toneMappingExposure = sun.altitude < 8 ? 1.2 : 1.05;
  } else {
    hemisphere.intensity = 2.15;
    fillLight.intensity = 1.25;
    rimLight.intensity = 0.45;
    renderer.toneMappingExposure = 1.08;
  }
  timeValue.textContent = formatTime(state.minutes);
  sunCaption.textContent = `${SEASONS[state.season].label} · Москва`;
  sunPosition.textContent = sun.altitude > 0 ? `${directionLabel(sun.azimuth)} · ${Math.round(sun.altitude)}°` : 'Солнце за горизонтом';
  const compassRadius = 25;
  const compassAngle = degToRad(sun.azimuth);
  compassSun.style.transform = `translate(${Math.sin(compassAngle) * compassRadius}px, ${-Math.cos(compassAngle) * compassRadius}px)`;
  compassSun.style.opacity = state.mode === 'sun' ? (sun.altitude > 0 ? '1' : '.28') : '0';
}
function setMode(mode) {
  state.mode = mode;
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const is2d = mode === '2d';
  mount.hidden = is2d;
  planView.hidden = !is2d;
  sunPanel.hidden = mode !== 'sun';
  roomChip.hidden = is2d;
  interactionHint.hidden = is2d;
  controls.enabled = !is2d;
  updateSun();
  requestAnimationFrame(resize);
}
modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
seasonButtons.forEach((button) => button.addEventListener('click', () => {
  state.season = button.dataset.season;
  seasonButtons.forEach((item) => item.classList.toggle('is-active', item === button));
  updateSun();
}));
timeRange.addEventListener('input', () => { state.minutes = Number(timeRange.value); updateSun(); });
resetButton.addEventListener('click', () => {
  camera.position.set(11.7, 11.2, 14.8);
  controls.target.set(0.2, 0.72, 0.15);
  controls.update();
});
fullscreenButton.addEventListener('click', async () => {
  if (!document.fullscreenElement) await stage.requestFullscreen?.(); else await document.exitFullscreen?.();
});
let hintHidden = false;
controls.addEventListener('start', () => {
  if (!hintHidden) { interactionHint.style.opacity = '0'; hintHidden = true; }
});
function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', resize);
function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
resize();
setMode('3d');
updateSun();
animate();
