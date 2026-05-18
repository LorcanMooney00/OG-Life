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
import java.text.SimpleDateFormat
import java.util.*
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

        // Set click to open the app
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "calendar")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_calendar_root, pendingIntent)

        // Show today's date
        val today = SimpleDateFormat("EEEE, MMM d", Locale.getDefault()).format(Date())
        views.setTextViewText(R.id.widget_calendar_date, today)
        views.setTextViewText(R.id.widget_calendar_events, "Loading...")
        appWidgetManager.updateAppWidget(appWidgetId, views)

        // Fetch data in background
        executor.execute {
            val text = try {
                val session = WidgetSessionManager.load(context)
                if (session == null || !session.isValid()) {
                    "Sign in to see events"
                } else {
                    val events = SupabaseWidgetClient.fetchUpcomingEvents(session, 7)
                    if (events.isEmpty()) {
                        "Nothing scheduled"
                    } else {
                        events.take(4).joinToString("\n") { event ->
                            val emoji = if (event.isAnniversary) "🎂 " else ""
                            val time = event.eventTime?.let { " $it" } ?: ""
                            val dateLabel = formatDateLabel(event.eventDate)
                            "$emoji${event.title}$time · $dateLabel"
                        }
                    }
                }
            } catch (e: Exception) {
                "Tap to refresh"
            }

            // Update on main thread
            mainHandler.post {
                views.setTextViewText(R.id.widget_calendar_events, text)
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
    }

    private fun formatDateLabel(dateStr: String): String {
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val date = sdf.parse(dateStr) ?: return dateStr
            
            val today = Calendar.getInstance()
            val eventCal = Calendar.getInstance().apply { time = date }
            
            val diffDays = ((eventCal.timeInMillis - today.timeInMillis) / (1000 * 60 * 60 * 24)).toInt()
            
            when {
                diffDays == 0 -> "Today"
                diffDays == 1 -> "Tomorrow"
                diffDays in 2..6 -> SimpleDateFormat("EEEE", Locale.getDefault()).format(date)
                else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(date)
            }
        } catch (e: Exception) {
            dateStr
        }
    }

    override fun onEnabled(context: Context) {
        // First widget placed
    }

    override fun onDisabled(context: Context) {
        // Last widget removed
    }
}
