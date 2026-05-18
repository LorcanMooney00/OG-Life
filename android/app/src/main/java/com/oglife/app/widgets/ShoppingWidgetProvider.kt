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
        val views = buildViews(context)
        views.setTextViewText(R.id.widget_shopping_count, "–")
        WidgetRows.bindShopping(views, emptyList(), "Loading…")
        appWidgetManager.updateAppWidget(appWidgetId, views)

        executor.execute {
            val (badge, message, items) = fetchShopping(context)
            mainHandler.post {
                val fresh = buildViews(context)
                fresh.setTextViewText(R.id.widget_shopping_count, badge)
                WidgetRows.bindShopping(fresh, items, message)
                appWidgetManager.updateAppWidget(appWidgetId, fresh)
            }
        }
    }

    private fun buildViews(context: Context): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_shopping)
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "shopping")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_shopping_root, pendingIntent)
        return views
    }

    private fun fetchShopping(
        context: Context,
    ): Triple<String, String, List<ShoppingItemWidget>> {
        return try {
            val session = WidgetSessionManager.load(context)
            if (session == null || !session.isValid()) {
                Triple("–", "Sign in to see your list", emptyList())
            } else {
                when (val result = SupabaseWidgetClient.fetchShoppingItems(session)) {
                    is WidgetFetchResult.Success -> {
                        val items = result.data
                        if (items.isEmpty()) {
                            Triple("✓", "All done — nothing to grab", emptyList())
                        } else {
                            Triple(items.size.toString(), "", items.take(5))
                        }
                    }
                    is WidgetFetchResult.Failure -> {
                        Triple("!", "Couldn't load list — open app", emptyList())
                    }
                }
            }
        } catch (_: Exception) {
            Triple("!", "Couldn't load — tap to open", emptyList())
        }
    }
}
