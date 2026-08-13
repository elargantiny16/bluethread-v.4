# BlueThread Bluetooth Messenger

BlueThread is a mobile-first Bluetooth messenger. The Android package uses Bluetooth Classic RFCOMM for direct phone-to-phone chat; the web build remains suitable for supported BLE serial devices.

## What is included

- Encrypted messages using Web Crypto AES-GCM.
- Username-based chat UI.
- Automatic BLE serial profile detection.
- Android-installable PWA files: `manifest.webmanifest`, `sw.js`, and app icons.
- Static web build: upload this folder to any HTTPS host.

## Android install

1. Host this folder on HTTPS, or serve it from localhost while testing.
2. Open the app in Android Chrome or Edge.
3. Tap **Install app** when the button appears, or use the browser menu and choose **Install app**.

Bluetooth and install support require a secure context: HTTPS or localhost. Opening `index.html` directly as a file can show the UI, but Bluetooth, service worker caching, and install prompts may not work.

## Encrypted chat

Both devices must enter the same **Room key**. Messages are encrypted before they are sent over Bluetooth with AES-256-GCM, PBKDF2-SHA-256 key derivation, authenticated metadata, and per-message nonces. The Android transport uses length-prefixed binary RFCOMM frames rather than newline-delimited JSON. The Android build also rejects oversized packets and ignores replayed message IDs. If the key is wrong, the receiver will see a decrypt error instead of the message.

The room key is not saved to local storage.

## Local web server

From this folder, run one of these:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

```powershell
npx serve .
```

Then open:

```text
http://127.0.0.1:4173/
```

## Notes

This package is an installable web app, not a signed Android APK. Building an APK would require Android tooling such as Android Studio, Capacitor, or a Trusted Web Activity wrapper.
