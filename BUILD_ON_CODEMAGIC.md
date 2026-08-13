# Build BlueThread on Codemagic

This package is configured to build an installable Android APK without requiring Android Studio on your computer.

1. Put this project in a Git repository (GitHub/GitLab/Bitbucket).
2. In Codemagic, choose **Add application** and connect that repository.
3. Select **Android / native Android** and the repository branch.
4. Make sure Codemagic detects the root `codemagic.yaml`.
5. Start the `BlueThread Android APK` workflow.
6. When it finishes, download `app-debug.apk` from **Artifacts**.
7. Transfer the APK to your Honor phone and tap it to install.

The APK is a debug build for direct installation/testing. For Google Play or a production release, create/upload an Android signing key and build a signed release APK/AAB.
