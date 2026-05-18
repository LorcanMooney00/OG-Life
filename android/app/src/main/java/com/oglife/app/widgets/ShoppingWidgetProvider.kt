package com.oglife.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.oglife.app.MainActivity
import com.oglife.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ShoppingWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_shopping)

        // Set click to open the app on the shopping tab
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "shopping")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_shopping_root, pendingIntent)

        // Fetch items in background
        CoroutineScope(Dispatchers.IO).launch {
            val session = WidgetSessionManager.load(context)

            if (session == null || !session.isValid()) {
                views.setTextViewText(R.id.widget_shopping_count, "–")
                views.setTextViewText(R.id.widget_shopping_items, "Open app to sign in")
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return@launch
            }

            val items = SupabaseWidgetClient.fetchShoppingItems(session)

            views.setTextViewText(
                R.id.widget_shopping_count,
                if (items.isEmpty()) "✓" else items.size.toString()
            )

            val text = if (items.isEmpty()) {
                "All done!"
            } else {
                items.take(8).joinToString("\n") { item ->
                    val qty = item.quantity?.let { " ($it)" } ?: ""
                    "• ${item.name}$qty"
                }
            }

            views.setTextViewText(R.id.widget_shopping_items, text)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    override fun onEnabled(context: Context) {
        // First widget placed
    }

    override fun onDisabled(context: Context) {
        // Last widget removed
    }
}
