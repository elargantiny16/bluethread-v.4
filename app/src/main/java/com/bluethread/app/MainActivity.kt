package com.bluethread.app

import android.Manifest
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import java.io.DataInputStream
import java.io.DataOutputStream
import java.util.UUID
import android.content.Context
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val executor = Executors.newFixedThreadPool(4)
    private val prefs by lazy { getSharedPreferences("bluethread", Context.MODE_PRIVATE) }
    private val adapter: BluetoothAdapter? by lazy { BluetoothAdapter.getDefaultAdapter() }
    @Volatile private var socket: BluetoothSocket? = null
    @Volatile private var serverSocket: BluetoothServerSocket? = null
    @Volatile private var output: DataOutputStream? = null
    @Volatile private var destroyed = false
    @Volatile private var serverRunning = false
    private val writeLock = Any()
    private val uuid: UUID = UUID.fromString("8d5f3c7a-5f5e-4b3e-9a36-0c5a7e5c8f11")
    private val maxPacketBytes = 64 * 1024
    private val connectTimeoutMs = 12000

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.settings.setSupportZoom(false)
        web.settings.builtInZoomControls = false
        web.settings.displayZoomControls = false
        web.settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        web.settings.loadsImagesAutomatically = true
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true
        web.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
        web.overScrollMode = WebView.OVER_SCROLL_NEVER
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(Bridge(), "BlueThreadAndroid")
        web.loadUrl("file:///android_asset/web/index.html")
        setContentView(web)
        requestBtPermissions()
    }

    private fun hasBtPermissions(): Boolean = if (Build.VERSION.SDK_INT >= 31) {
        checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    } else true

    private fun requestBtPermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            val p = arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
            val missing = p.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            if (missing.isNotEmpty()) {
                requestPermissions(missing.toTypedArray(), 100)
            } else {
                startServer()
            }
        } else if (Build.VERSION.SDK_INT >= 23 &&
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 101)
        } else {
            startServer()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!destroyed && hasBtPermissions()) startServer()
    }
    

    private fun post(js: String) {
        if (!destroyed) runOnUiThread { if (!destroyed) web.evaluateJavascript(js, null) }
    }

    @Synchronized
    private fun startServer() {
        if (destroyed || !hasBtPermissions() || serverRunning || socket != null) return
        val bt = adapter ?: return
        if (!bt.isEnabled) return
        serverRunning = true
        executor.execute {
            try {
                val ss = bt.listenUsingRfcommWithServiceRecord("BlueThread", uuid)
                serverSocket = ss
                while (!destroyed && socket == null) {
                    try {
                        val accepted = ss.accept()
                        if (destroyed) {
                            accepted.close()
                            break
                        }
                        if (socket == null) {
                            socket = accepted
                            prefs.edit().putString("last_device", accepted.remoteDevice.address).apply()
                            setupSocket(accepted)
                            break
                        } else {
                            accepted.close()
                        }
                    } catch (e: Exception) {
                        if (!destroyed) post("window.BlueThreadWeb.onError(${JSONObjectEscape(e.message ?: "Bluetooth listener stopped")})")
                        break
                    }
                }
            } catch (e: Exception) {
                if (!destroyed) post("window.BlueThreadWeb.onError(${JSONObjectEscape(e.message ?: "Could not start Bluetooth listener")})")
            } finally {
                try { serverSocket?.close() } catch (_: Exception) {}
                serverSocket = null
                serverRunning = false
            }
        }
    }

    private fun setupSocket(s: BluetoothSocket) {
        try {
            output = DataOutputStream(s.outputStream)
            post("window.BlueThreadWeb.onConnected(${JSONObjectEscape(s.remoteDevice.name ?: "Bluetooth peer")})")
            val input = DataInputStream(s.inputStream)
            executor.execute {
                try {
                    while (!destroyed) {
                        val length = input.readInt()
                        if (length <= 0 || length > maxPacketBytes) {
                            post("window.BlueThreadWeb.onError(\"Invalid or oversized packet\")")
                            break
                        }
                        val payload = ByteArray(length)
                        input.readFully(payload)
                        val message = payload.toString(Charsets.UTF_8)
                        post("window.BlueThreadWeb.onMessage(${JSONObjectEscape(message)})")
                    }
                } catch (e: Exception) {
                    if (!destroyed && e !is java.io.EOFException) {
                        post("window.BlueThreadWeb.onError(${JSONObjectEscape(e.message ?: "Connection lost")})")
                    }
                } finally {
                    closeConnection(restartServer = !destroyed)
                }
            }
        } catch (e: Exception) {
            post("window.BlueThreadWeb.onError(${JSONObjectEscape(e.message ?: "Bluetooth setup failed")})")
            closeConnection(restartServer = !destroyed)
        }
    }

    private fun chooseDevice() {
        if (!hasBtPermissions()) { requestBtPermissions(); return }
        startServer()
        val bt = adapter
        if (bt == null) { toast("This phone has no Bluetooth"); return }
        if (!bt.isEnabled) {
            startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            toast("Turn Bluetooth on, then tap Pair device again")
            return
        }
        val bonded = try { bt.bondedDevices.toList() } catch (_: SecurityException) { emptyList() }
        if (bonded.isEmpty()) {
            startActivity(Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS))
            toast("Pair the other phone in Android Bluetooth settings first")
            return
        }
        val names = bonded.map { it.name ?: it.address }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Choose paired phone")
            .setItems(names) { _, which -> connectTo(bonded[which]) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun connectTo(device: BluetoothDevice) {
        if (!hasBtPermissions()) { requestBtPermissions(); return }
        executor.execute {
            try {
                adapter?.cancelDiscovery()
                closeConnection(restartServer = false)
                val s = device.createRfcommSocketToServiceRecord(uuid)
                s.connect()
                socket = s
                prefs.edit().putString("last_device", device.address).apply()
                setupSocket(s)
            } catch (e: Exception) {
                post("window.BlueThreadWeb.onError(${JSONObjectEscape(e.message ?: "Could not connect")})")
                closeConnection(restartServer = !destroyed)
            }
        }
    }

    private fun reconnectLast() {
        if (!hasBtPermissions()) { requestBtPermissions(); return }
        val address = prefs.getString("last_device", null) ?: run {
            toast("No previous Bluetooth device")
            return
        }
        val bt = adapter ?: return
        if (!bt.isEnabled) {
            startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            return
        }
        val device = try { bt.getRemoteDevice(address) } catch (_: IllegalArgumentException) { null }
        if (device == null) { toast("Saved Bluetooth device is unavailable"); return }
        connectTo(device)
    }

    private fun send(text: String) {
        val payload = text.toByteArray(Charsets.UTF_8)
        if (payload.isEmpty() || payload.size > maxPacketBytes) {
            post("window.BlueThreadWeb.onError(\"Message too large\")")
            return
        }
        executor.execute {
            try {
                val out = output ?: throw IllegalStateException("Not connected")
                synchronized(writeLock) {
                    // Length-prefixed binary framing: no delimiter scanning, no readLine(),
                    // and UTF-8 messages may safely contain any newline or Unicode character.
                    out.writeInt(payload.size)
                    out.write(payload)
                    out.flush()
                }
            } catch (e: Exception) {
                post("window.BlueThreadWeb.onError(${JSONObjectEscape(e.message ?: "Send failed")})")
                closeConnection(restartServer = !destroyed)
            }
        }
    }

    private fun closeConnection(restartServer: Boolean = true) {
        val oldSocket = socket
        val oldOutput = output
        socket = null
        output = null
        try { oldOutput?.close() } catch (_: Exception) {}
        try { oldSocket?.close() } catch (_: Exception) {}
        if (!destroyed) post("window.BlueThreadWeb.onDisconnected()")
        if (restartServer) startServer()
    }

    override fun onDestroy() {
        destroyed = true
        closeConnection(restartServer = false)
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
        try { web.removeJavascriptInterface("BlueThreadAndroid") } catch (_: Exception) {}
        web.destroy()
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun toast(s: String) = runOnUiThread { Toast.makeText(this, s, Toast.LENGTH_SHORT).show() }

    inner class Bridge {
        @JavascriptInterface fun connect() { runOnUiThread { chooseDevice() } }
        @JavascriptInterface fun disconnect() { closeConnection() }
        @JavascriptInterface fun reconnect() { reconnectLast() }
        @JavascriptInterface fun send(text: String) { send(text) }
    }
}

private fun JSONObjectEscape(s: String): String =
    "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""
