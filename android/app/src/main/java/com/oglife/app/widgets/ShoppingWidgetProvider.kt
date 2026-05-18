package com.oglife.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import com.oglife.app.MainActivity
import com.oglife.app.R
import java.util.concurrent.Executors

class ShoppingWidgetProvider : AppWidgetProvider() {

    companion object {
        private val executor = Executors.newSingleThreadExecutor()
        private val mainHandler = Handler(Looper.getMainLooper())
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context.applicationContext, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_shopping)

        // Set click to open the app
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "shopping")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_shopping_root, pendingIntent)

        views.setTextViewText(R.id.widget_shopping_count, "–")
        views.setTextViewText(R.id.widget_shopping_items, "Loading...")
        appWidgetManager.updateAppWidget(appWidgetId, views)

        // Fetch data in background
        executor.execute {
            val result = try {
                val session = WidgetSessionManager.load(context)
                if (session == null || !session.isValid()) {
                    Pair("–", "Sign in to see list")
                } else {
                    val items = SupabaseWidgetClient.fetchShoppingItems(session)
                    if (items.isEmpty()) {
                        Pair("✓", "All done!")
                    } else {
                        val count = items.size.toString()
                        val text = items.take(6).joinToString("\n") { item ->
                            val qty = item.quantity?.let { " ($it)" } ?: ""
                            "• ${item.name}$qty"
                        }
                        Pair(count, text)
                    }
                }
            } catch (e: Exception) {
                Pair("!", "Tap to refresh")
            }

            // Update on main thread
            mainHandler.post {
                views.setTextViewText(R.id.widget_shopping_count, result.first)
                views.setTextViewText(R.id.widget_shopping_items, result.second)
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
    }

    override fun onEnabled(context: Context) {
        // First widget placed
    }

    override fun onDisabled(context: Context) {
        // Last widget removed
    }
}
