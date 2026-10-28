# BlueThread Android
# 🧵 BlueThread v.4
An encrypted, peer-to-peer Bluetooth messenger for Android designed for offline, secure communication.

## 🌟 Overview
BlueThread allows users to communicate securely without an internet connection or cellular network. Ideal for hackathons, robotics competitions, or emergency scenarios where networks are congested or unavailable.

## 🔒 Security Features
- **End-to-End Encryption:** Utilizes `AES-256-GCM` for secure message payloads.
- **Direct Connection:** Uses Android `RFCOMM` for direct device-to-device pairing.
- **Zero-Logging:** Messages exist only in local memory and are never stored on a central server.

## 🛠️ Tech Stack
- **Language:** Java / Kotlin
- **Cryptography:** AES-256-GCM
- **Networking:** Android Bluetooth API (RFCOMM)

## 🚀 How to Build
1. Clone this repository.
2. Open in Android Studio.
3. Sync Gradle and run on a physical Android device (Bluetooth emulation on virtual devices is limited).
