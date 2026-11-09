/**
 * main.js — MR Platform entry point
 * Plataforma de Mixed Reality (estilo EnJoyTheMR)
 */
import * as THREE from 'three';
import { Passthrough } from './passthrough.js';
import { StereoRenderer } from './stereo.js';
import { HandTracker } from './hands.js';
import { Launcher } from './launcher.js';

let renderer, scene, camera, stereo, passthrough, hands, launcher;
let currentApp = 'home';
let demoObjects = [];
let lastTime = 0;
let stereoMode = true;

const canvas = document.getElementById('canvas');
const loadingEl = document.getElementById('loading');
const loadingLabel = document.getElementById('loading-label');
const startScreen = document.getElementById('start-screen');
const btnStart = document.getElementById('btn-start');
const hudMode = document.getElementById('hud-mode');
const hudHands = document.getElementById('hud-hands');
const hudApp = document.getElementById('hud-app');
const videoEl = document.getElementById('cam-feed');

function setLoading(text) {
  if (loadingLabel) loadingLabel.textContent = text;
  loadingEl.style.display = 'flex';
}

function hideLoading() {
  loadingEl.style.display = 'none';
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  onResize();
  window.addEventListener('resize', onResize);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (stereo) stereo.setSize(w, h);
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  stereoMode = w > h;
}

function initGyro() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(state => { if (state === 'granted') listenGyro(); })
      .catch(() => {});
  } else {
    listenGyro();
  }
}

let gyroAlpha = 0, gyroBeta = 0, gyroGamma = 0;
function listenGyro() {
  window.addEventListener('deviceorientation', (e) => {
    if (e.alpha !== null) {
      gyroAlpha = e.alpha;
      gyroBeta = e.beta;
      gyroGamma = e.gamma;
    }
  }, true);
}

function applyGyro() {
  if (!camera) return;
  // Simple head orientation from deviceorientation
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(gyroBeta - 90),
    THREE.MathUtils.degToRad(gyroAlpha),
    THREE.MathUtils.degToRad(-gyroGamma),
    'YXZ'
  );
  camera.quaternion.setFromEuler(euler);
}

async function initFrontCamera() {
  // Front camera only for hand tracking
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
}

function buildPlatform() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 50);
  camera.position.set(0, 1.5, 0);

  // Soft ambient so virtual objects are visible over passthrough
  const amb = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.5);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  passthrough = new Passthrough(scene);
  stereo = new StereoRenderer(renderer, 0.064);
  stereo.setSize(window.innerWidth, window.innerHeight);

  launcher = new Launcher(scene);
  launcher.updateSelection(0);

  hands = new HandTracker();
}

function clearDemoObjects() {
  demoObjects.forEach(o => {
    scene.remove(o);
    o.geometry?.dispose();
    o.material?.dispose();
  });
  demoObjects = [];
}

function loadApp(appId) {
  currentApp = appId;
  hudApp.textContent = `APP: ${appId}`;
  clearDemoObjects();

  if (appId === 'home') {
    launcher.setVisible(true);
    return;
  }

  launcher.setVisible(false);

  if (appId === 'empty') {
    // Solo passthrough + manos, nada más
    return;
  }

  if (appId === 'demo-panel') {
    // Algunos objetos flotantes de prueba
    const colors = [0xff4488, 0x44ffaa, 0x4488ff, 0xffaa44];
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        emissive: colors[i % colors.length],
        emissiveIntensity: 0.4,
        metalness: 0.3,
        roughness: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / 6) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 1.2, 1.2 + Math.sin(i) * 0.3, -1.8 + Math.sin(angle) * 0.4);
      mesh.userData = { baseY: mesh.position.y, phase: i };
      scene.add(mesh);
      demoObjects.push(mesh);
    }
  }
}

function openSelected() {
  const app = launcher.getSelectedApp();
  if (app) loadApp(app.id);
}

function gameLoop(ts) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  applyGyro();
  passthrough?.update(camera);
  launcher?.follow(camera);

  // Animate demo objects
  demoObjects.forEach((o, i) => {
    o.rotation.y += dt * 0.8;
    o.rotation.x += dt * 0.4;
    if (o.userData.baseY !== undefined) {
      o.position.y = o.userData.baseY + Math.sin(ts * 0.002 + o.userData.phase) * 0.12;
    }
  });

  if (stereoMode && stereo) {
    stereo.render(scene, camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}

btnStart.addEventListener('click', async () => {
  startScreen.style.display = 'none';
  setLoading('Iniciando plataforma…');

  initRenderer();
  initGyro();
  buildPlatform();

  // Passthrough (rear camera)
  setLoading('Cámara del mundo real…');
  const ptOk = await passthrough.init();
  hudMode.textContent = ptOk ? 'MR 👁' : 'VR (sin passthrough)';

  // Front camera for hands
  setLoading('Hand tracking…');
  try {
    await initFrontCamera();
    await hands.init(videoEl);
    hands.on('frame', ({ left, right }) => {
      const l = left?.gesture || '—';
      const r = right?.gesture || '—';
      hudHands.textContent = `👈 ${l}   👉 ${r}`;

      // POINT gesture = select / open
      if (left?.gesture === 'POINT' || right?.gesture === 'POINT') {
        // Simple: use camera forward as ray
        const origin = camera.position.clone();
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        launcher.pick(origin, dir);
      }
      if (left?.gesture === 'FIST' || right?.gesture === 'FIST') {
        // Fist = open selected
        if (launcher.visible) openSelected();
      }
      if (left?.gesture === 'VICTORY' || right?.gesture === 'VICTORY') {
        // Victory = back to home
        loadApp('home');
      }
    });
  } catch (e) {
    console.warn('Hands failed', e);
    hudHands.textContent = 'Manos no disponibles';
  }

  // UI buttons
  document.getElementById('btn-toggle-mr')?.addEventListener('click', () => {
    passthrough.setEnabled(!passthrough.enabled);
    hudMode.textContent = passthrough.enabled ? 'MR 👁' : 'VR';
  });

  document.getElementById('btn-home')?.addEventListener('click', () => {
    loadApp('home');
  });

  hideLoading();
  loadApp('home');
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
});

// Desktop fallback keys
window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft') launcher?.updateSelection(launcher.selected - 1);
  if (e.code === 'ArrowRight') launcher?.updateSelection(launcher.selected + 1);
  if (e.code === 'Enter' || e.code === 'Space') openSelected();
  if (e.code === 'Escape') loadApp('home');
  if (e.code === 'KeyM') {
    passthrough?.setEnabled(!passthrough.enabled);
    hudMode.textContent = passthrough?.enabled ? 'MR 👁' : 'VR';
  }
});
