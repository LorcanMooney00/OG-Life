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

class CalendarWidgetProvider : AppWidgetProvider() {

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
        val views = RemoteViews(context.packageName, R.layout.widget_calendar)
        bindLaunchIntent(context, views)
        views.setTextViewText(R.id.widget_calendar_date, WidgetFormat.headerDate())

        WidgetDataCache.setCalendar(emptyList(), WidgetDataCache.State.LOADING, "Loading…")
        applyViews(context, appWidgetManager, appWidgetId, views, showList = false, "Loading…")

        executor.execute {
            val (state, message, events) = fetchCalendar(context)
            WidgetDataCache.setCalendar(events, state, message)

            val showList = state == WidgetDataCache.State.OK && events.isNotEmpty()

            mainHandler.post {
                val fresh = RemoteViews(context.packageName, R.layout.widget_calendar)
                bindLaunchIntent(context, fresh)
                fresh.setTextViewText(R.id.widget_calendar_date, WidgetFormat.headerDate())
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

    private fun fetchCalendar(context: Context): Triple<WidgetDataCache.State, String, List<CalendarEventWidget>> {
        return try {
            val session = WidgetSessionManager.load(context)
            if (session == null || !session.isValid()) {
                Triple(WidgetDataCache.State.SIGNED_OUT, "Sign in to see events", emptyList())
            } else {
                val events = SupabaseWidgetClient.fetchUpcomingEvents(session, 7)
                if (events.isEmpty()) {
                    Triple(WidgetDataCache.State.EMPTY, "Nothing coming up this week", emptyList())
                } else {
                    Triple(WidgetDataCache.State.OK, "", events.take(6))
                }
            }
        } catch (_: Exception) {
            Triple(WidgetDataCache.State.ERROR, "Couldn't load — tap to open", emptyList())
        }
    }

    private fun bindLaunchIntent(context: Context, views: RemoteViews) {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "calendar")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_calendar_root, pendingIntent)
    }

    private fun applyViews(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        views: RemoteViews,
        showList: Boolean,
        emptyText: String
    ) {
        val serviceIntent = Intent(context, CalendarWidgetService::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            data = Uri.parse("oglife://widget/calendar/$appWidgetId")
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
