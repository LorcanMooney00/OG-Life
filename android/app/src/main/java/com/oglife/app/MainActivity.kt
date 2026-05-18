package com.oglife.app

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(OgWidgetsPlugin::class.java)
        super.onCreate(savedInstanceState)
        
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val screen = intent?.getStringExtra("screen")
        if (screen != null) {
            // Pass the screen param to the web app via URL
            bridge?.let { b ->
                b.webView?.post {
                    b.webView?.loadUrl("javascript:window.location.href='/?screen=$screen'")
                }
            }
        }
    }
}
