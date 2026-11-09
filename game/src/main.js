/**
 * main.js — Game entry point
 */
import * as THREE from 'three';
import { PhysicsWorld }    from './physics.js';
import { HandTracker }     from './handTracker.js';
import { Player }          from './player.js';
import { buildLevel }      from './level.js';
import { EnemyManager }    from './enemy.js';
import { StereoRenderer }  from './stereoRenderer.js';
import { GESTURE }         from './handGestures.js';

let renderer, scene, physics, player, enemies, stereo, handTracker;
let levelObjects = [];
let gameRunning  = false;
let stereoMode   = true;
let lastTime     = 0;
let score        = 0;
let motionOk     = false;
let cameraOk     = false;

const canvas        = document.getElementById('canvas');
const loadingEl     = document.getElementById('loading');
const loadingLabel  = document.getElementById('loading-label');
const startScreen   = document.getElementById('start-screen');
const permMsg       = document.getElementById('permission-msg');
const btnStart      = document.getElementById('btn-start');
const btnGrant      = document.getElementById('btn-grant');
const hudScore      = document.getElementById('hud-score');
const hudWave       = document.getElementById('hud-wave');
const hudAmmo       = document.getElementById('hud-ammo');
const healthFill    = document.getElementById('health-fill');
const gestureLeft   = document.getElementById('gesture-left');
const gestureRight  = document.getElementById('gesture-right');
const damageFlash   = document.getElementById('damage-flash');
const videoEl       = document.getElementById('cam-feed');

function setLoading(text) {
  if (loadingLabel) loadingLabel.textContent = text;
  loadingEl.style.display = 'flex';
}

function hideLoading() {
  loadingEl.style.display = 'none';
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label + ' timeout')), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  onResize();
  window.addEventListener('resize', onResize);
}

async function lockLandscape() {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      await el.requestFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) {
    // Orientation Lock API not supported (e.g. desktop Safari) — ignore.
  }
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (stereo) stereo.setSize(w, h);
  if (player) {
    player.camera.aspect = w / h;
    player.camera.updateProjectionMatrix();
  }
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

function listenGyro() {
  motionOk = true;
  window.addEventListener('deviceorientation', (e) => {
    if (player && e.alpha !== null) {
      player.setGyro(e.alpha, e.beta, e.gamma);
    }
  }, true);
}

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('getUserMedia missing');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width:     { ideal: 224, max: 320 },
      height:    { ideal: 168, max: 240 },
      frameRate: { ideal: 30, max: 60 },
    },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  cameraOk = true;
}

btnGrant.addEventListener('click', async () => {
  permMsg.style.display = 'none';
  try {
    await withTimeout(initCamera(), 8000, 'camera');
    if (cameraOk) startHandTracking();
  } catch (e) {
    console.warn('Camera denied:', e);
  }
});

async function startHandTracking() {
  if (!cameraOk || !videoEl.srcObject) return;
  handTracker = new HandTracker();
  await handTracker.init(videoEl);
  handTracker.addEventListener('frame', (e) => {
    if (!gameRunning || !player) return;
    const { left, right } = e.detail;
    player.applyGestures(left.tracker, right.tracker, 1/60);
    player.updateHandMeshes(left.tracker, right.tracker);
    gestureLeft.textContent  = `👈 ${left.gesture}`;
    gestureRight.textContent = `👉 ${right.gesture}`;
  });
}

function buildWorld() {
  scene   = new THREE.Scene();
  physics = new PhysicsWorld();
  physics.addFloor(0);
  levelObjects = buildLevel(scene, physics);
  player = new Player(scene, physics);

  player.addEventListener('punch', (e) => {
    const { pos, dir } = e.detail;
    enemies.enemies.forEach(enemy => {
      if (enemy.dead) return;
      const dist = enemy.position.distanceTo(pos);
      if (dist < 1.2) {
        const dmg = 25 + Math.random() * 15;
        enemy.takeDamage(dmg, dir);
        if (enemy.dead) {
          score += 100;
          hudScore.textContent = `🏆 ${score}`;
        }
      }
    });
  });

  player.addEventListener('damaged', (e) => {
    healthFill.style.width = e.detail.hp + '%';
    triggerDamageFlash();
  });

  player.addEventListener('died', () => {
    setTimeout(() => showGameOver(), 500);
  });

  enemies = new EnemyManager(scene, physics);
  enemies.spawnWave(4);
  stereo = new StereoRenderer(renderer, 0.064);
  stereo.setSize(window.innerWidth, window.innerHeight);
}

function triggerDamageFlash() {
  damageFlash.style.animation = 'none';
  damageFlash.offsetHeight;
  damageFlash.style.animation = 'flash 0.5s ease-out forwards';
}

function showGameOver() {
  gameRunning = false;
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    color:#ff4444;font-family:monospace;font-size:2em;text-align:center;gap:16px;
  `;
  overlay.innerHTML = `
    <div style="color:#f00;text-shadow:0 0 20px #f00">💀 GAME OVER</div>
    <div style="font-size:0.6em;color:#fff">Score: ${score}</div>
    <button onclick="location.reload()" style="
      padding:12px 32px;font-family:monospace;font-size:0.6em;
      background:#300;border:2px solid #f00;color:#f00;cursor:pointer;border-radius:8px;
    ">▶ REINTENTAR</button>
  `;
  document.body.appendChild(overlay);
}

function gameLoop(ts) {
  if (!gameRunning) return;
  requestAnimationFrame(gameLoop);
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  physics.step(dt);
  player.update(dt);
  const dmgThisFrame = enemies.update(dt, player.position, player.camera.position);
  if (dmgThisFrame > 0) player.takeDamage(dmgThisFrame);
  if (enemies.aliveCount === 0) {
    enemies.nextWave();
    hudWave.textContent = `WAVE ${enemies.wave}`;
    score += 500;
    hudScore.textContent = `🏆 ${score}`;
  }
  if (!handTracker) {
    gestureLeft.textContent  = '📱 gyro only';
    gestureRight.textContent = '🚶 VC = walk';
  }
  if (stereoMode) stereo.render(scene, player.camera);
  else {
    renderer.setRenderTarget(null);
    renderer.render(scene, player.camera);
  }
}

function beginLoop() {
  const checkOrientation = () => {
    stereoMode = window.innerWidth > window.innerHeight;
  };
  window.addEventListener('resize', checkOrientation);
  checkOrientation();
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

async function bootstrap() {
  initRenderer();
  hideLoading();
  startScreen.style.display = 'flex';

  btnStart.addEventListener('click', async () => {
    if (gameRunning) return;
    startScreen.style.display = 'none';
    setLoading('Iniciando…');
    await lockLandscape();
    initGyro();

    try {
      setLoading('Cámara…');
      await withTimeout(initCamera(), 8000, 'camera');
    } catch (e) {
      console.warn('Camera denied:', e);
      cameraOk = false;
    }

    try {
      setLoading('Armando arena…');
      buildWorld();
    } catch (e) {
      console.error(e);
      setLoading('Error al armar el nivel: ' + (e && e.message ? e.message : e));
      return;
    }

    hideLoading();
    beginLoop();

    if (cameraOk) {
      startHandTracking().catch((err) => {
        console.warn('Hand tracking failed:', err);
        handTracker = null;
        gestureLeft.textContent = '👈 gyro only';
        gestureRight.textContent = '👉 no hands';
      });
    } else {
      gestureLeft.textContent = '👈 sin cámara';
      gestureRight.textContent = '👉 gyro only';
    }
  });

  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  setInterval(() => {
    if (!player || !gameRunning) return;
    player._walkLeft = keys.has('KeyW') || keys.has('ArrowUp');
    if (keys.has('Space')) player.recenter();
  }, 16);
}

bootstrap().catch((err) => {
  console.error(err);
  setLoading('Error al iniciar: ' + (err && err.message ? err.message : err));
});
