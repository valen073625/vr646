# Android .apk wrapper (Capacitor)

`mobile-client/` already works perfectly as a plain web page — this folder
just wraps it in a real, installable `.apk` for people who want an app icon
instead of a browser tab. Same honest caveat as the SteamVR driver: turning
web code into an `.apk` needs Android's native build tools once. You do that
build; the people you hand the `.apk` to just tap install, nothing else.

## What this wrapper actually does

It is **not** a copy of `mobile-client/`'s code. It's a tiny native shell
(`www/index.html`) that asks once for your PC's IP address, saves it, and
then does a full-page navigation to `http://<that-ip>:8080/` — the same
address the PC app's QR code points at. From that point on you're running
the exact same `mobile-client/` page as before, just inside a borderless
native WebView instead of Chrome's UI. This is deliberate: your PC's IP
changes between networks, so baking a fixed address into the app would break
it elsewhere, and bundling the web files inside the `.apk` would make
`location.hostname` resolve to nothing useful for the WebSocket connection.

## One-time build setup

1. Install **Android Studio** (free) — it bundles the Android SDK and a JDK.
2. Install **Node.js** only on your *dev* machine (needed for the Capacitor
   CLI that scaffolds the native project; not needed by end users, same as
   electron-builder earlier).

## Build steps

```bash
cd mobile-apk
npm install
npx cap add android       # generates the android/ native project (gitignored)
```

Open `android/app/src/main/AndroidManifest.xml` and make two additions
(Capacitor's cleartext config handles most of this, but camera access needs
an explicit permission + a runtime grant hook):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```
(as siblings of the existing `<uses-permission>` lines, inside `<manifest>`,
above `<application>`).

Capacitor's default `MainActivity` (`android/app/src/main/java/.../MainActivity.java`)
extends `BridgeActivity`, whose WebView already implements
`onPermissionRequest` and auto-grants whatever the page asks for (camera,
in our case) — so no extra native code is required for the thumbs-up
gesture's `getUserMedia()` call to work, even though the WebView has
navigated away to the PC's origin.

```bash
npx cap sync android
npx cap open android      # opens the project in Android Studio
```

In Android Studio: **Build → Generate Signed Bundle / APK → APK**, create a
new keystore the first time (Android Studio walks you through it), build
the **release** variant. Output lands at:
```
android/app/release/app-release.apk
```

## Installing it on the phone

Copy the `.apk` over (USB, email to yourself, a shared drive — anything) and
tap it on the phone. Android will warn about "installing from unknown
sources" the first time — that's normal for anything not from the Play
Store; allow it for this one file.

## Using it

1. Open the app, type the PC's IP (shown in the DIY VR Link app's QR card),
   tap Connect.
2. From there it behaves exactly like the browser version: grant camera
   permission when prompted, mount the phone in your cardboard/VR holder,
   use Recenter/Auto-walk as before.
3. If the PC's IP changes (new network, router reboot), you can get back to
   the IP-entry screen by uninstalling+reinstalling, or simply add a tiny
   "change PC" link in `www/index.html` pointing back to itself before the
   redirect — left as a one-line tweak since it's a matter of taste where to
   put that control.

## What's *not* included here on purpose

- **No Play Store listing / signing-for-distribution guidance** — this is a
  personal-use side-loaded `.apk`, not a published app; Play Store requires
  a developer account, privacy policy, content rating, etc., a separate
  process unrelated to the VR system itself.
- **No TWA/Digital Asset Links variant** — a Trusted Web Activity would let
  Chrome itself host the page with zero native WebView code and no
  "unknown sources" warning, but it requires the page to be served over
  **HTTPS** with a verified domain, which conflicts with this project's
  "just run it on your home Wi-Fi, no domain/certs needed" design. The
  WebView wrapper above is the right trade-off for a LAN-only tool like
  this one.
