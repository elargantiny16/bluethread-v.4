plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.bluethread.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.bluethread.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "1.3"
    }
}
