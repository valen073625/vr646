# DIY PC VR Streaming & Tracking System

A from-scratch DIY VR rig: your phone becomes a 3DoF head-tracked
"headset + gesture controller," your PC runs an Electron app that turns that
into something SteamVR can see.

```
vr-diy-system/
├── pc-app/                  Electron app (the only thing your PC user runs)
│   ├── package.json
│   ├── main.js              WebSocket/HTTP servers, UDP bridge to the driver,
│   │                        keyboard-walk simulation, settings persistence
│   ├── preload.js
│   └── src/
│       ├── index.html       Config UI (sliders, QR pairing, status, telemetry)
│       ├── renderer.js
│       └── style.css
│
├── mobile-client/           Served to the phone's browser by pc-app's HTTP server
│   ├── index.html
│   ├── style.css
│   ├── orientation.js       DeviceOrientation -> quaternion, smoothing, recenter
│   ├── stereo.js            Three.js SBS stereo render + barrel distortion + vignette
│   ├── gesture.js           MediaPipe Hands thumbs-up detector
│   ├── net.js                WebSocket client to the PC
│   ├── app.js                Glue/UI for the phone page
│   └── manifest.webmanifest
│
├── native-driver/           C++ SteamVR driver — THE ONE PART THAT MUST BE
│   ├── CMakeLists.txt       COMPILED (SteamVR drivers are native code; see
│   ├── src/*.cpp/.h         native-driver/README.md for why and how).
│   └── driver/              Build once yourself; ship the compiled .dll to
│                            your users, who never touch a compiler.
│
├── mobile-apk/              Optional: wraps mobile-client/ as a real
│   ├── capacitor.config.json installable Android .apk instead of a browser
│   ├── www/index.html        tab (one-time build with Android Studio — see
│   └── README.md             mobile-apk/README.md).
│
└── README.md                 (this file)
```

## How the pieces talk to each other

```
 Phone browser                         PC (Electron app)                  SteamVR
┌───────────────────┐   WebSocket     ┌───────────────────┐   UDP       ┌───────────────┐
│ DeviceOrientation  │ ───pose/gesture→│ main.js            │ ─loopback→ │ driver_diyvr  │
│ MediaPipe Hands    │ ←───settings───│  - smoothing        │  127.0.0.1 │ (virtual HMD) │
│ Three.js stereo    │                │  - deadzone          │  :27015   │               │
│ view + distortion  │                │  - gaze-steer calc   │           │ feeds SteamVR │
└───────────────────┘                │  - W-key simulation  │           │ compositor    │
        ▲                             │    (nut-js)          │           └───────────────┘
        └── served over HTTP :8080 ───┘
```

The phone never talks to SteamVR directly — it only ever talks to the
Electron app over your home Wi-Fi. The Electron app is the only thing that
needs to be "installed" (as a portable .exe), and the native driver is the
only thing that needs a one-time compile (done by you, the developer, not
your end users).

---

## 1. Running it during development

```bash
cd pc-app
npm install
npm start
```

The window that opens shows a QR code / URL — scan it (or type the URL)
into your phone's browser **while your phone is on the same Wi-Fi network as
the PC**. Tap "Start" on the phone, grant motion + camera permissions, and
you should see the status pill in the PC window turn green.

---

## 2. Packaging the PC app into a standalone, zero-install .exe

### Option A: build it in the cloud (no install on your machine)

This repo's **Actions** tab has a **Build PC App (.exe)** workflow
(`.github/workflows/build-pc-app.yml`) that builds it on a GitHub-hosted
Windows runner:

1. GitHub → **Actions** → **Build PC App (.exe)** → **Run workflow**.
2. Wait a couple of minutes, open the finished run, download the
   `diy-vr-link-portable-exe` artifact (a zip containing the `.exe`).

### Option B: build it yourself locally

```bash
cd pc-app
npm install
npm run dist:portable
```

This uses `electron-builder` (already in `devDependencies`) with the
`"portable"` target configured in `package.json`'s `"build"` block, which
produces a single self-contained file:

```
pc-app/dist/DIY-VR-Link-Portable.exe
```

That file bundles Node.js and Chromium inside it — the person running it
needs **nothing** pre-installed (no Node, no Python, no Visual C++
redistributables beyond what Windows already ships). They just double-click
it and the app window + servers start, exactly like `npm start` did for you.

A few notes:
- `electron-builder`'s first run downloads Electron's prebuilt binaries;
  this needs internet access once, on your dev machine, not on the end
  user's machine.
- `@nut-tree-fork/nut-js` (used for the simulated W keypress) ships
  prebuilt native bindings for common Node/Electron ABI versions, so
  `electron-builder` just bundles the matching prebuilt binary — no local
  compiler needed for this package either. If `npm install` ever tries to
  build it from source on your machine (rare), install the
  ["windows-build-tools"](https://github.com/felixrieseberg/windows-build-tools)
  once on your dev machine only.
- The `extraResources` entry in `package.json` copies `mobile-client/` next
  to the packaged app so the built-in HTTP server can still serve it.

---

## 3. Hooking the phone into SteamVR

### a) Build the native driver once (dev machine only)

Follow `native-driver/README.md`. Output: `driver_diyvr.dll`, placed at
`native-driver/driver/bin/win64/driver_diyvr.dll`.

### b) Register the driver with SteamVR

On the PC that will run SteamVR (this can be the same one-time step your
installer/zip performs automatically, or a manual step for now):

```powershell
"C:\Program Files (x86)\Steam\steamapps\common\SteamVR\bin\win64\vrpathreg.exe" adddriver "C:\path\to\vr-diy-system\native-driver\driver"
```

Verify it registered:
```powershell
"C:\Program Files (x86)\Steam\steamapps\common\SteamVR\bin\win64\vrpathreg.exe" show
```
You should see `diyvr` listed under "External Drivers".

### c) Launch order

1. Start SteamVR (it will show "headset not detected" — that's expected,
   nothing has fed it a pose yet).
2. Launch `DIY-VR-Link-Portable.exe` (or `npm start` in dev).
3. Open the mobile client page on your phone and tap Start.
4. Within a second or two of the phone sending its first pose packet,
   SteamVR's headset icon should switch to "ready," and `vrmonitor` will
   show **DIYVR_HMD_01** as the active HMD.
5. Launch a SteamVR game as normal (Library → right-click → Play).

### d) Connecting phone + PC over Wi-Fi (step-by-step)

1. Make sure the phone and PC are on the **same Wi-Fi network** (a lot of
   routers isolate "guest" networks from each other — use the main one).
2. On the PC, open the Electron app; note the IP:port shown (e.g.
   `http://192.168.1.42:8080/`), or just scan the QR code.
3. On the phone, open that URL in Chrome (Android) or Safari (iOS). Using
   the browser rather than an app avoids any app-store install step.
4. Tap **Start**. The browser will ask for:
   - **Motion & orientation access** (iOS only, prompted via a button tap —
     required for head tracking).
   - **Camera access** (for the thumbs-up gesture walking).
5. Put the phone into your cardboard/VR holder. Use the **Recenter** button
   (or double-tilt your head) once it's mounted, since the mounting angle
   itself isn't "forward."
6. Back on the PC, the status pill should read "Phone connected." Adjust
   sensitivity/smoothing/deadzone/IPD sliders to taste — changes apply to
   the phone live, no reconnect needed.
7. If the PC has a firewall prompt the first time you run the app, allow it
   on "Private networks" so the phone can reach ports 7890 (data) and 8080
   (the mobile page).

#### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Phone can't load the page at all | Different Wi-Fi networks, AP isolation enabled, or Windows Firewall blocking inbound connections |
| Page loads but status stays red | A browser extension or VPN rewriting `localhost`/`location.hostname`; try the PC's IP directly |
| Head tracking jumpy | Lower sensitivity, raise smoothing, or raise the deadzone a little |
| Head tracking laggy/rubbery | Smoothing is too high; move it down toward 0.1–0.2 |
| SteamVR never shows the headset | Driver not registered (`vrpathreg show`), or UDP port 27015 blocked locally, or the Electron app isn't running |
| Walking won't stop | Camera lighting is poor (model keeps misfiring); switch to Auto-walk toggle mode instead of hold mode |

---

## 4. What's a full implementation vs. a scaffold here

Built and working end-to-end as given:
- Electron app, UI, settings persistence, WebSocket + HTTP servers, UDP
  bridge protocol, keyboard-walk simulation.
- Mobile head tracking (filtered quaternion, deadzone, sensitivity,
  recenter, tilt-to-recenter), gaze-based steering vector, gesture
  detection (thumbs-up via MediaPipe, hold or toggle mode), SBS stereo
  rendering with barrel distortion and a speed-based comfort vignette.
- The native driver skeleton correctly implements the OpenVR provider/device
  interfaces SteamVR requires and will genuinely register & pose-update a
  virtual HMD once compiled.

Deliberately left as a documented extension point, because it's a separate
subsystem on the scale of the rest of this project combined:
- **Game video → phone.** This system gets your phone recognized as an HMD
  and feeding it head pose, but the actual stereo *game image* SteamVR's
  compositor renders still needs a capture+encode+network+decode pipeline
  (what ALVR/Virtual Desktop/Moonlight exist to do) to reach the phone. The
  placeholder 3D room in `stereo.js` exists so you can verify tracking,
  optics, and comfort features without that piece. `stereo.js` has a
  `VideoTextureSource` hook ready for wiring in a WebRTC video track once
  you add that capture pipeline (e.g. adapting an existing open-source
  WebRTC game-streaming sender into the Electron main process).
- **Virtual controller / analog joystick axis** (`movement.mode =
  "driverAxis"`) is read by the PC app and sent over UDP, but the native
  driver here only implements the HMD device; a `vr::ITrackedDeviceServerDriver`
  for a controller (component `IVRDriverInput`) would need to be added
  alongside `HmdDeviceDriver` the same way it's added here for the headset.
