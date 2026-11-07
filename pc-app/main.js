// main.js — Electron main process
//
// Responsibilities:
//  1. Host a WebSocket server that the phone connects to (head pose + gestures).
//  2. Re-broadcast the latest head pose to the native SteamVR driver over a
//     loopback UDP socket (see ../native-driver). This is the "driver bridge".
//  3. Turn the gesture "walk forward" signal into either:
//       a) a simulated W keypress (works with flat/desktop games, and with
//          many VR games that accept keyboard locomotion), or
//       b) a forward value sent to the native driver, which exposes it as an
//          analog joystick axis on the emulated controller (works with any
//          SteamVR game that uses standard locomotion bindings).
//  4. Persist user settings (sensitivity, smoothing, deadzone, IPD, etc.) and
//     expose them to the renderer (UI) and to the phone (so the phone can
//     apply filtering settings locally too, e.g. smoothing factor).
//  5. Show a QR code / IP:port in the UI so pairing the phone is a one-step scan.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dgram = require('dgram');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const WS_PORT = 7890; // phone <-> PC (raw pose/gesture data)
const HTTP_PORT = 8080; // phone <-> PC (serves the mobile-client web app)
const DRIVER_UDP_PORT = 27015; // PC app -> native OpenVR driver (loopback only)
const MOBILE_CLIENT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'mobile-client')
  : path.join(__dirname, '..', 'mobile-client');

const DEFAULT_SETTINGS = {
  sensitivity: 1.0, // multiplier on incoming rotation delta
  smoothing: 0.35, // 0 = no smoothing (raw), 0.9 = very smooth/laggy
  deadzoneDeg: 0.3, // ignore rotation jitter below this angle per sample
  ipdMm: 63,
  invertPitch: false,
  movement: {
    mode: 'keyboard', // 'keyboard' | 'driverAxis'
    gazeSteering: true,
    maxSpeed: 1.0
  }
};

let settings = loadSettings();
let mainWindow;
let wss;
let driverSocket;
let lastPhoneSocket = null;
let connectedPhoneInfo = null;

// Smoothing state lives here (server-side) as a safety net in case the phone
// is on an old cached version; the phone also smooths locally for lower
// perceived latency. See docs/ARCHITECTURE.md for the two-stage filter.
let smoothedQuat = { w: 1, x: 0, y: 0, z: 0 };
let walking = false;

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// ---------- Quaternion helpers ----------
function slerp(a, b, t) {
  let { w: aw, x: ax, y: ay, z: az } = a;
  let { w: bw, x: bx, y: by, z: bz } = b;
  let dot = aw * bw + ax * bx + ay * by + az * bz;
  if (dot < 0) { bw = -bw; bx = -bx; by = -by; bz = -bz; dot = -dot; }
  if (dot > 0.9995) {
    // Nearly identical — linear interpolate & normalize.
    const w = aw + t * (bw - aw);
    const x = ax + t * (bx - ax);
    const y = ay + t * (by - ay);
    const z = az + t * (bz - az);
    return normalizeQuat({ w, x, y, z });
  }
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * Math.sin(theta) / sinTheta0;
  const s1 = Math.sin(theta) / sinTheta0;
  return {
    w: s0 * aw + s1 * bw,
    x: s0 * ax + s1 * bx,
    y: s0 * ay + s1 * by,
    z: s0 * az + s1 * bz
  };
}

function normalizeQuat(q) {
  const len = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1;
  return { w: q.w / len, x: q.x / len, y: q.y / len, z: q.z / len };
}

function angleBetween(a, b) {
  let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  dot = Math.min(1, Math.max(-1, Math.abs(dot)));
  return 2 * Math.acos(dot) * (180 / Math.PI);
}

// ---------- Driver bridge (UDP, loopback only) ----------
// Binary packet layout (little-endian), 40 bytes:
//   float32 qw, qx, qy, qz   (head orientation, 16 bytes)
//   float32 moveX, moveZ    (left/right, forward/back axis, 8 bytes)
//   float32 x, y, z         (reserved for future positional tracking, 12 bytes)
//   uint32  flags           (bit0 = walking, bit1 = recenter pulse, 4 bytes)
function sendPoseToDriver(quat, moveX, moveZ, flags) {
  if (!driverSocket) return;
  const buf = Buffer.alloc(40);
  buf.writeFloatLE(quat.w, 0);
  buf.writeFloatLE(quat.x, 4);
  buf.writeFloatLE(quat.y, 8);
  buf.writeFloatLE(quat.z, 12);
  buf.writeFloatLE(moveX, 16);
  buf.writeFloatLE(moveZ, 20);
  buf.writeFloatLE(0, 24); // x
  buf.writeFloatLE(0, 28); // y
  buf.writeFloatLE(0, 32); // z
  buf.writeUInt32LE(flags >>> 0, 36);
  driverSocket.send(buf, DRIVER_UDP_PORT, '127.0.0.1');
}

function startDriverBridge() {
  driverSocket = dgram.createSocket('udp4');
  driverSocket.bind(); // ephemeral local port; we only send, never receive
}

// ---------- Keyboard locomotion (nut-js) ----------
// Lazily required because native bindings are only needed if the user picks
// "keyboard" movement mode.
let nut = null;
async function ensureNut() {
  if (!nut) nut = require('@nut-tree-fork/nut-js');
  return nut;
}

async function setWalking(shouldWalk) {
  if (shouldWalk === walking) return;
  walking = shouldWalk;
  if (settings.movement.mode !== 'keyboard') return;
  try {
    const { keyboard, Key } = await ensureNut();
    if (shouldWalk) await keyboard.pressKey(Key.W);
    else await keyboard.releaseKey(Key.W);
  } catch (err) {
    console.error('Keyboard simulation failed (nut-js not available):', err.message);
  }
  broadcastStatus();
}

// ---------- Static HTTP server for the mobile client ----------
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};
function startHttpServer() {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(MOBILE_CLIENT_DIR, reqPath);
    if (!filePath.startsWith(MOBILE_CLIENT_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  server.listen(HTTP_PORT);
}

// ---------- WebSocket server (phone <-> PC) ----------
function startWebSocketServer() {
  wss = new WebSocket.Server({ port: WS_PORT });

  wss.on('connection', (ws, req) => {
    lastPhoneSocket = ws;
    connectedPhoneInfo = { ip: req.socket.remoteAddress, since: Date.now() };
    broadcastStatus();

    // Send current settings immediately so the phone's local filters match.
    ws.send(JSON.stringify({ type: 'settings', settings }));

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      handlePhoneMessage(msg);
    });

    ws.on('close', () => {
      if (lastPhoneSocket === ws) {
        lastPhoneSocket = null;
        connectedPhoneInfo = null;
        setWalking(false);
        broadcastStatus();
      }
    });
  });
}

function handlePhoneMessage(msg) {
  switch (msg.type) {
    case 'pose': {
      // msg.quat = { w, x, y, z } from the phone's DeviceOrientation reading,
      // already converted to a right-handed, Y-up quaternion by the client.
      const raw = normalizeQuat(msg.quat);
      const delta = angleBetween(raw, smoothedQuat);
      if (delta < settings.deadzoneDeg) {
        // Inside deadzone: hold the last smoothed value (kills micro-jitter).
      } else {
        const t = 1 - settings.smoothing; // smoothing=0.9 -> t=0.1 (slow follow)
        smoothedQuat = slerp(smoothedQuat, raw, Math.min(1, Math.max(0.01, t)));
      }

      let moveX = 0, moveZ = 0, flags = 0;
      if (msg.walking) {
        flags |= 1;
        // Gaze steering: walk in the direction the head (yaw) is pointing.
        // We approximate forward-in-head-space as -Z through the quaternion.
        const q = smoothedQuat;
        const fx = 2 * (q.x * q.z + q.w * q.y);
        const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
        const len = Math.hypot(fx, fz) || 1;
        moveX = (fx / len) * settings.movement.maxSpeed;
        moveZ = (fz / len) * settings.movement.maxSpeed;
      }
      if (msg.recenter) flags |= 2;

      sendPoseToDriver(smoothedQuat, moveX, moveZ, flags);
      setWalking(!!msg.walking);

      if (mainWindow) {
        mainWindow.webContents.send('telemetry', {
          quat: smoothedQuat,
          walking: !!msg.walking,
          delta
        });
      }
      break;
    }
    case 'gesture': {
      // Explicit gesture events (thumbs-up start/stop), independent of pose
      // messages, in case the phone sends them on a different cadence.
      setWalking(!!msg.active);
      break;
    }
    case 'recenter': {
      sendPoseToDriver(smoothedQuat, 0, 0, 2);
      break;
    }
    default:
      break;
  }
}

function broadcastStatus() {
  if (!mainWindow) return;
  mainWindow.webContents.send('status', {
    connected: !!lastPhoneSocket,
    phone: connectedPhoneInfo,
    ip: getLocalIPv4(),
    wsPort: WS_PORT,
    walking
  });
}

// ---------- IPC with renderer (settings UI) ----------
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('get-connection-info', async () => {
  const ip = getLocalIPv4();
  const httpUrl = `http://${ip}:${HTTP_PORT}/`;
  const qrDataUrl = await QRCode.toDataURL(httpUrl, { margin: 1, width: 160 });
  return { ip, wsPort: WS_PORT, httpPort: HTTP_PORT, httpUrl, qrDataUrl };
});
ipcMain.handle('update-settings', (_evt, partial) => {
  settings = { ...settings, ...partial, movement: { ...settings.movement, ...(partial.movement || {}) } };
  saveSettings();
  if (lastPhoneSocket && lastPhoneSocket.readyState === WebSocket.OPEN) {
    lastPhoneSocket.send(JSON.stringify({ type: 'settings', settings }));
  }
  return settings;
});

// ---------- Window ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', broadcastStatus);
}

app.whenReady().then(() => {
  startDriverBridge();
  startWebSocketServer();
  startHttpServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (wss) wss.close();
  if (driverSocket) driverSocket.close();
  if (process.platform !== 'darwin') app.quit();
});
