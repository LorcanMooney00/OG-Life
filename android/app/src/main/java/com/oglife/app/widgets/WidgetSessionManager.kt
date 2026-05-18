package com.oglife.app.widgets

import android.content.Context
import android.content.SharedPreferences

data class WidgetSession(
    val supabaseUrl: String,
    val anonKey: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long
) {
    fun isValid(): Boolean = accessToken.isNotBlank() && supabaseUrl.isNotBlank()
}

object WidgetSessionManager {
    private const val PREFS_NAME = "og_widget_session"
    private const val KEY_SUPABASE_URL = "supabase_url"
    private const val KEY_ANON_KEY = "anon_key"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_EXPIRES_AT = "expires_at"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun save(
        ctx: Context,
        supabaseUrl: String,
        anonKey: String,
        accessToken: String,
        refreshToken: String,
        expiresAt: Long
    ) {
        prefs(ctx).edit()
            .putString(KEY_SUPABASE_URL, supabaseUrl)
            .putString(KEY_ANON_KEY, anonKey)
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_EXPIRES_AT, expiresAt)
            .apply()
    }

    fun load(ctx: Context): WidgetSession? {
        val p = prefs(ctx)
        val url = p.getString(KEY_SUPABASE_URL, "") ?: ""
        val anonKey = p.getString(KEY_ANON_KEY, "") ?: ""
        val access = p.getString(KEY_ACCESS_TOKEN, "") ?: ""
        val refresh = p.getString(KEY_REFRESH_TOKEN, "") ?: ""
        val expires = p.getLong(KEY_EXPIRES_AT, 0L)

        if (url.isBlank() || access.isBlank()) return null

        return WidgetSession(url, anonKey, access, refresh, expires)
    }

    fun clear(ctx: Context) {
        prefs(ctx).edit().clear().apply()
    }
}
