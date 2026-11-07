// net.js — WebSocket connection to the PC app. Auto-reconnects, and applies
// settings pushed down from the PC's UI (sensitivity/smoothing/etc. are the
// source of truth on the PC, but we also keep a local copy for the stereo
// renderer's IPD and the gaze/vignette math, since round-tripping every
// frame through the PC just to find out "am I walking" would add latency).

const Net = (() => {
  let ws;
  let url;
  let connected = false;
  let onSettings = () => {};
  let onConnectionChange = () => {};

  function connect(wsUrl) {
    url = wsUrl;
    open();
  }

  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => { connected = true; onConnectionChange(true); };
    ws.onclose = () => { connected = false; onConnectionChange(false); setTimeout(open, 1000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      if (msg.type === 'settings') onSettings(msg.settings);
    };
  }

  function sendPose(quat, walking, recenter) {
    if (!connected) return;
    ws.send(JSON.stringify({ type: 'pose', quat, walking, recenter }));
  }

  function sendRecenter() {
    if (!connected) return;
    ws.send(JSON.stringify({ type: 'recenter' }));
  }

  return {
    connect,
    sendPose,
    sendRecenter,
    get connected() { return connected; },
    set onSettings(fn) { onSettings = fn; },
    set onConnectionChange(fn) { onConnectionChange = fn; }
  };
})();
