# Native SteamVR driver (why this part can't be "zero toolchain")

Everything in `pc-app/` and `mobile-client/` runs as plain JS/HTML with no
compiler needed. **This folder is the one exception**, and it's an exception
for a structural reason, not a design choice: SteamVR only loads drivers that
implement OpenVR's native C++ ABI (`vr::IServerTrackedDeviceProvider`,
`vr::ITrackedDeviceServerDriver`, etc.) from a platform-specific shared
library (`driver_xxx.dll` on Windows). There is no JavaScript/Node entry
point into that interface — Valve's own `openvr_api.dll` is a C++ binary
contract. Every community HMD-emulator driver (ALVR, Relag's driver4vr,
iVRy, etc.) ships a compiled C++ `.dll` for exactly this reason.

So: this skeleton **must be compiled once** with a free toolchain
(Visual Studio Community + the OpenVR SDK headers, both free downloads). You
do this once as the developer; the people you give the finished app to never
need to touch Visual Studio — they just get the already-built
`driver_diyvr/bin/win64/driver_diyvr.dll` dropped into their SteamVR folder
by your installer/zip, same as any other SteamVR add-on driver.

## What it does

- Registers one virtual HMD (`DIYVR_HMD_01`) with SteamVR so it shows up in
  the headset list and SteamVR's compositor starts rendering to it.
- Every frame, reads the latest pose + movement packet from the Electron
  app over a **loopback UDP socket** (127.0.0.1:27015 — see
  `pc-app/main.js`'s `sendPoseToDriver`) and feeds it into
  `GetPose()`.
- Optionally registers one virtual controller whose trackpad/joystick `y`
  axis is driven by the same movement packet, for games that use analog
  locomotion instead of keyboard input (`movement.mode = "driverAxis"` in
  the PC app's settings).
- Does **not** itself capture or display video — see the note in
  `mobile-client/stereo.js` about the separate video-streaming subsystem
  SteamVR's compositor output would need if you want the phone to show the
  actual game frame instead of the bundled test scene.

## Build steps (one-time, on your dev machine)

1. Install **Visual Studio 2022 Community** (free) with the "Desktop
   development with C++" workload.
2. Download the OpenVR SDK headers:
   `git clone https://github.com/ValveSoftware/openvr.git`
   and point `OPENVR_SDK_DIR` (see `CMakeLists.txt`) at it, or drop its
   `headers/` and `lib/` folders into `native-driver/third_party/openvr/`.
3. Install **CMake** (free) and run:
   ```
   cmake -B build -A x64
   cmake --build build --config Release
   ```
4. The output lands in `build/Release/driver_diyvr.dll`. Copy the whole
   `driver/` folder (see layout below) next to your Electron app's resources,
   with the compiled `.dll` placed at
   `driver/bin/win64/driver_diyvr.dll`.

## Folder layout SteamVR expects

```
driver/
  driver.vrdrivermanifest
  bin/
    win64/
      driver_diyvr.dll        <-- the file you just compiled
  resources/
    settings/
      default.vrsettings
```

## Installing it into SteamVR (done by your end users, no compiling)

See the root `README.md` → "Hooking the phone into SteamVR" for the exact
`vrpathreg` command. In short:
```
"C:\Program Files (x86)\Steam\steamapps\common\SteamVR\bin\win64\vrpathreg.exe" adddriver "C:\path\to\driver"
```
