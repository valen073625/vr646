/**
 * main.js — Game entry point
 * Ties together: Three.js scene, physics, hand tracking, player, enemies, stereo renderer.
 */
import * as THREE from 'three';
import { PhysicsWorld }    from './physics.js';
import { HandTracker }     from './handTracker.js';
import { Player }          from './player.js';
import { buildLevel }      from './level.js';
import { EnemyManager }    from './enemy.js';
import { StereoRenderer }  from './stereoRenderer.js';
import { GESTURE }         from './handGestures.js';

// ─── Global state ───────────────────────────────────────────────────────────
let renderer, scene, physics, player, enemies, stereo, handTracker;
let levelObjects = [];
let gameRunning  = false;
let stereoMode   = true;
let lastTime     = 0;
let score        = 0;
let motionOk     = false;
let cameraOk     = false;

// ─── DOM refs ───────────────────────────────────────────────────────────────
const canvas        = document.getElementById('canvas');
const loadingEl     = document.getElementById('loading');
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

// ─── Init Three.js renderer ─────────────────────────────────────────────────
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  onResize();
  window.addEventListener('resize', onResize);
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

// ─── Gyroscope ──────────────────────────────────────────────────────────────
function initGyro() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+: permission needed
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

// ─── Camera / Hand tracking ──────────────────────────────────────────────────
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 240 },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    cameraOk = true;
  } catch(e) {
    console.warn('Camera denied:', e);
    permMsg.style.display = 'flex';
  }
}

btnGrant.addEventListener('click', async () => {
  permMsg.style.display = 'none';
  await initCamera();
  if (cameraOk) await startHandTracking();
});

async function startHandTracking() {
  if (!cameraOk || !videoEl.srcObject) return;
  try {
    handTracker = new HandTracker();
    await handTracker.init(videoEl);

    handTracker.addEventListener('frame', (e) => {
      if (!gameRunning || !player) return;
      const { left, right } = e.detail;

      // Apply to player
      player.applyGestures(left.tracker, right.tracker, 1/60);
      player.updateHandMeshes(left.tracker, right.tracker);

      // Update HUD gesture labels
      gestureLeft.textContent  = `👈 ${left.gesture}`;
      gestureRight.textContent = `👉 ${right.gesture}`;
    });
  } catch(err) {
    console.warn('Hand tracking failed:', err);
    gestureLeft.textContent  = '👈 gyro only';
    gestureRight.textContent = '👉 no hands';
  }
}

// ─── Build world ─────────────────────────────────────────────────────────────
function buildWorld() {
  scene   = new THREE.Scene();
  physics = new PhysicsWorld();
  physics.addFloor(0);

  levelObjects = buildLevel(scene, physics);

  player = new Player(scene, physics);

  // Player event handlers
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
    // Also throw grabbed objects with punch force
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
  damageFlash.offsetHeight; // reflow
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

// ─── Main loop ───────────────────────────────────────────────────────────────
function gameLoop(ts) {
  if (!gameRunning) return;
  requestAnimationFrame(gameLoop);

  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  // Physics step
  physics.step(dt);

  // Player update
  player.update(dt);

  // Enemy update
  const dmgThisFrame = enemies.update(dt, player.position, player.camera.position);
  if (dmgThisFrame > 0) {
    player.takeDamage(dmgThisFrame);
  }

  // Check wave cleared
  if (enemies.aliveCount === 0) {
    enemies.nextWave();
    hudWave.textContent = `WAVE ${enemies.wave}`;
    score += 500;
    hudScore.textContent = `🏆 ${score}`;
  }

  // Hand label updates (if no hand tracking, show gyro-only)
  if (!handTracker) {
    gestureLeft.textContent  = '📱 gyro only';
    gestureRight.textContent = '🚶 VC = walk';
  }

  // Render
  if (stereoMode) {
    stereo.render(scene, player.camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene, player.camera);
  }
}

// ─── Startup ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  initRenderer();

  // Preload MediaPipe / Three
  await new Promise(r => setTimeout(r, 300));

  loadingEl.style.display = 'none';
  startScreen.style.display = 'flex';

  btnStart.addEventListener('click', async () => {
    startScreen.style.display = 'none';
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('loading').querySelector('div').nextSibling.textContent = 'Iniciando…';

    // Request gyro (iOS)
    initGyro();

    // Request camera
    await initCamera();
    if (cameraOk) await startHandTracking();

    // Build world
    buildWorld();

    document.getElementById('loading').style.display = 'none';

    // Stereo mode toggle: landscape = stereo, portrait = mono
    const checkOrientation = () => {
      stereoMode = window.innerWidth > window.innerHeight;
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();

    gameRunning = true;
    lastTime    = performance.now();
    requestAnimationFrame(gameLoop);
  });

  // Keyboard fallback for desktop testing
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup',   (e) => keys.delete(e.code));

  // Simple keyboard walk for desktop testing (wasd)
  setInterval(() => {
    if (!player || !gameRunning) return;
    if (keys.has('KeyW') || keys.has('ArrowUp'))    player._walkLeft  = true;
    else player._walkLeft = false;
    if (keys.has('Space')) player.recenter();
  }, 16);
}

bootstrap().catch(console.error);
