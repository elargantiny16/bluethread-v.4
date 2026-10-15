# BlueThread Android

This is an Android version of the supplied BlueThread project.

## What changed

- The original browser Web Bluetooth implementation was replaced with a native Android Bluetooth Classic RFCOMM bridge.
- Two Android phones can communicate directly over Bluetooth using the same BlueThread app.
- The existing HTML/CSS UI is retained.
- Messages are sent as UTF-8 JSON payloads over a length-prefixed binary RFCOMM frame. This avoids delimiter scanning/readLine() latency and safely supports Unicode, newlines, and compact packet boundaries.
- Android 12+ Bluetooth permissions are included.

## Build

Open this folder in Android Studio.

Use:
- Android Gradle Plugin 8.6.1
- Kotlin 2.0.21
- compileSdk 35

Then Build > Build APK(s).

## Use

1. Install the APK on both phones.
2. Turn Bluetooth on.
3. Pair the two phones in Android Bluetooth settings.
4. Open BlueThread on both phones.
5. On either phone, tap "Pair device" and select the other paired phone.
6. Send messages.

The phone that receives the incoming RFCOMM connection also acts as the server.

## Important

This is Bluetooth Classic RFCOMM, not Web Bluetooth BLE. The original BLE UUIDs in the web version were intended for Nordic UART / HM-10 peripherals, not ordinary phone-to-phone communication.

The transport now uses a 4-byte big-endian payload length followed by UTF-8 bytes, with a 64 KiB hard limit. Encryption, replay filtering, reconnect handling, and synchronized writes are implemented in the current package. Background operation still requires a foreground service for a production-grade always-on messenger.
