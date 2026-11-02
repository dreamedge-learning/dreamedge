package com.dreamedge.mobile

import android.os.StatFs
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // How much room is left where downloads land.
        //
        // There is no way to ask this from Dart, and the previous answer came
        // from Process.run("df"), which parses a human-readable table and
        // cannot run inside an app sandbox at all. StatFs is the figure the
        // platform itself uses, and availableBytes is specifically what this
        // app may write rather than what is physically unused -- the two differ
        // by the system's own reserve, and refusing a 700 MB download because
        // of a reserve the app can never touch would be the wrong answer.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, STORAGE_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "freeBytes" -> {
                        val path = call.argument<String>("path")
                        if (path.isNullOrEmpty()) {
                            result.error("bad_path", "A path is required.", null)
                        } else {
                            result.success(availableBytes(path))
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    /// Null rather than a guess when the path cannot be stat'ed: the caller
    /// skips the space check on an unknown answer, which is better than
    /// refusing a download the device had room for.
    private fun availableBytes(path: String): Long? {
        val target = File(path).let { if (it.exists()) it else it.parentFile }
            ?: return null

        return try {
            StatFs(target.absolutePath).availableBytes
        } catch (error: IllegalArgumentException) {
            null
        }
    }

    private companion object {
        const val STORAGE_CHANNEL = "com.dreamedge.mobile/storage"
    }
}
