package com.oglife.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
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
        bindLaunchIntent(context, views)

        WidgetDataCache.setShopping(emptyList(), WidgetDataCache.State.LOADING, "Loading…")
        applyViews(context, appWidgetManager, appWidgetId, views, showList = false, "Loading…")
        views.setTextViewText(R.id.widget_shopping_count, "–")

        executor.execute {
            val (state, message, items) = fetchShopping(context)
            WidgetDataCache.setShopping(items, state, message)

            val badge = when (state) {
                WidgetDataCache.State.OK -> items.size.toString()
                WidgetDataCache.State.EMPTY -> "✓"
                WidgetDataCache.State.SIGNED_OUT -> "–"
                WidgetDataCache.State.ERROR -> "!"
                WidgetDataCache.State.LOADING -> "–"
            }

            val showList = state == WidgetDataCache.State.OK && items.isNotEmpty()

            mainHandler.post {
                val fresh = RemoteViews(context.packageName, R.layout.widget_shopping)
                bindLaunchIntent(context, fresh)
                fresh.setTextViewText(R.id.widget_shopping_count, badge)
                applyViews(
                    context,
                    appWidgetManager,
                    appWidgetId,
                    fresh,
                    showList = showList,
                    emptyText = message
                )
            }
        }
    }

    private fun fetchShopping(context: Context): Triple<WidgetDataCache.State, String, List<ShoppingItemWidget>> {
        return try {
            val session = WidgetSessionManager.load(context)
            if (session == null || !session.isValid()) {
                Triple(WidgetDataCache.State.SIGNED_OUT, "Sign in to see your list", emptyList())
            } else {
                val items = SupabaseWidgetClient.fetchShoppingItems(session)
                if (items.isEmpty()) {
                    Triple(WidgetDataCache.State.EMPTY, "All done — nothing to grab", emptyList())
                } else {
                    Triple(WidgetDataCache.State.OK, "", items.take(8))
                }
            }
        } catch (_: Exception) {
            Triple(WidgetDataCache.State.ERROR, "Couldn't load — tap to open", emptyList())
        }
    }

    private fun bindLaunchIntent(context: Context, views: RemoteViews) {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "shopping")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_shopping_root, pendingIntent)
    }

    private fun applyViews(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        views: RemoteViews,
        showList: Boolean,
        emptyText: String
    ) {
        val serviceIntent = Intent(context, ShoppingWidgetService::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            data = Uri.parse("oglife://widget/shopping/$appWidgetId")
        }
        views.setRemoteAdapter(R.id.widget_list, serviceIntent)

        if (showList) {
            views.setViewVisibility(R.id.widget_list, View.VISIBLE)
            views.setViewVisibility(R.id.widget_empty, View.GONE)
        } else {
            views.setViewVisibility(R.id.widget_list, View.GONE)
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setTextViewText(R.id.widget_empty, emptyText)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list)
    }
}
