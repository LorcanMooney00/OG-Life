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
        val views = buildViews(context)
        views.setTextViewText(R.id.widget_calendar_date, WidgetFormat.headerDate())
        WidgetRows.bindCalendar(views, emptyList(), "Loading…")
        appWidgetManager.updateAppWidget(appWidgetId, views)

        executor.execute {
            val (message, events) = fetchCalendar(context)
            mainHandler.post {
                val fresh = buildViews(context)
                fresh.setTextViewText(R.id.widget_calendar_date, WidgetFormat.headerDate())
                WidgetRows.bindCalendar(fresh, events, message)
                appWidgetManager.updateAppWidget(appWidgetId, fresh)
            }
        }
    }

    private fun buildViews(context: Context): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_calendar)
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "calendar")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_calendar_root, pendingIntent)
        return views
    }

    private fun fetchCalendar(
        context: Context,
    ): Pair<String, List<CalendarEventWidget>> {
        return try {
            val session = WidgetSessionManager.load(context)
            if (session == null || !session.isValid()) {
                Pair("Sign in to see events", emptyList())
            } else {
                val events = SupabaseWidgetClient.fetchUpcomingEvents(session, 7)
                if (events.isEmpty()) {
                    Pair("Nothing coming up this week", emptyList())
                } else {
                    Pair("", events.take(4))
                }
            }
        } catch (_: Exception) {
            Pair("Couldn't load — tap to open", emptyList())
        }
    }
}
