package com.oglife.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.oglife.app.widgets.WidgetSessionManager
import com.oglife.app.widgets.WidgetUpdater

@CapacitorPlugin(name = "OgWidgets")
class OgWidgetsPlugin : Plugin() {

    @PluginMethod
    fun syncSession(call: PluginCall) {
        val supabaseUrl = call.getString("supabaseUrl") ?: ""
        val anonKey = call.getString("anonKey") ?: ""
        val accessToken = call.getString("accessToken") ?: ""
        val refreshToken = call.getString("refreshToken") ?: ""
        val expiresAt = call.getLong("expiresAt") ?: 0L

        val ctx = context ?: run {
            call.reject("No context")
            return
        }

        WidgetSessionManager.save(
            ctx,
            supabaseUrl,
            anonKey,
            accessToken,
            refreshToken,
            expiresAt
        )

        // Trigger immediate widget refresh
        WidgetUpdater.refreshAllWidgets(ctx)

        call.resolve()
    }

    @PluginMethod
    fun clearSession(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("No context")
            return
        }

        WidgetSessionManager.clear(ctx)
        WidgetUpdater.refreshAllWidgets(ctx)

        call.resolve()
    }
}
