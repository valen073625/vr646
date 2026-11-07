// app.js — wires together orientation tracking, the stereo renderer,
// gesture detection, and the network link to the PC. Also owns the small
// bits of local UI state (auto-walk toggle, recenter button/gesture).

const App = (() => {
  const settings = {
    ipdMm: 63,
    sensitivity: 1,
    smoothing: 0.35,
    deadzoneDeg: 0.3,
    invertPitch: false,
    autoWalk: false,
    maxSpeedForVignette: 1.0
  };

  let canvas, gestureEnabled = true;
  let lastWalking = false;
  let displaySpeed = 0; // smoothed, purely for the vignette's visual ramp

  function applyRemoteSettings(remote) {
    settings.ipdMm = remote.ipdMm;
    settings.sensitivity = remote.sensitivity;
    settings.smoothing = remote.smoothing;
    settings.deadzoneDeg = remote.deadzoneDeg;
    settings.invertPitch = remote.invertPitch;
    Orientation.updateSettings({
      sensitivity: remote.sensitivity,
      smoothing: remote.smoothing,
      deadzoneDeg: remote.deadzoneDeg,
      invertPitch: remote.invertPitch
    });
    Stereo.setIpd(remote.ipdMm);
  }

  function wsUrlForThisHost() {
    // The mobile client is served by the PC's HTTP server, so the PC's IP is
    // just the current page's host; only the port differs (the raw data
    // socket runs on 7890, see pc-app/main.js WS_PORT).
    return `ws://${location.hostname}:7890`;
  }

  function onWalkChange(walking) {
    lastWalking = walking;
  }

  function loop() {
    const quat = Orientation.getQuat();

    // Speed ramps 0->1 over ~400ms so the vignette fades in smoothly instead
    // of snapping on, which is itself a small comfort improvement.
    const target = lastWalking ? 1 : 0;
    displaySpeed += (target - displaySpeed) * 0.08;
    Stereo.setSpeed(displaySpeed);
    Stereo.render(quat);

    Net.sendPose(quat, lastWalking, false);

    requestAnimationFrame(loop);
  }

  async function start() {
    document.getElementById('gate').classList.add('hidden');
    const root = document.getElementById('vrRoot');
    root.classList.remove('hidden');

    canvas = document.getElementById('glcanvas');
    Stereo.init(canvas);

    const okOrientation = await Orientation.enable();
    if (!okOrientation) {
      showError('Motion sensor permission was denied — head tracking will not work. Reload and allow it to continue.');
    }

    Net.onConnectionChange = (connected) => {
      document.getElementById('connDot').className = 'dot ' + (connected ? 'on' : 'off');
    };
    Net.onSettings = applyRemoteSettings;
    Net.connect(wsUrlForThisHost());

    gestureEnabled = document.getElementById('gestureToggle').checked;
    if (gestureEnabled) {
      try {
        await Gesture.init({
          video: document.getElementById('camFeed'),
          overlay: document.getElementById('gestureOverlay'),
          onWalk: onWalkChange
        });
      } catch (err) {
        showError('Camera permission denied — gesture walking disabled. Tap Auto-walk to move instead.');
      }
    }

    document.getElementById('recenterBtn').addEventListener('click', () => {
      Orientation.recenter();
      Net.sendRecenter();
    });
    document.getElementById('autowalkBtn').addEventListener('click', () => {
      settings.autoWalk = !settings.autoWalk;
      document.getElementById('autowalkBtn').textContent = `Auto-walk: ${settings.autoWalk ? 'ON' : 'OFF'}`;
    });

    // Comfort shortcut: a quick double head-tilt (roll) also recenters, for
    // when reaching the screen isn't convenient once the phone is in a
    // cardboard shell.
    setupTiltRecenter();

    requestAnimationFrame(loop);
  }

  function setupTiltRecenter() {
    let lastTiltTime = 0;
    let wasTilted = false;
    setInterval(() => {
      const q = Orientation.getQuat();
      // Roll angle from quaternion (rotation about forward/Z axis).
      const roll = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.z * q.z + q.x * q.x));
      const tilted = Math.abs(roll) > (35 * Math.PI / 180);
      if (tilted && !wasTilted) {
        const now = performance.now();
        if (now - lastTiltTime < 600) {
          Orientation.recenter();
          Net.sendRecenter();
        }
        lastTiltTime = now;
      }
      wasTilted = tilted;
    }, 100);
  }

  function showError(msg) {
    const e = document.getElementById('errorMsg');
    if (e) e.textContent = msg;
    else alert(msg);
  }

  document.getElementById('startBtn').addEventListener('click', start);

  return { settings };
})();
