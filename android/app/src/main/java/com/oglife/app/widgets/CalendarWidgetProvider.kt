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
import java.text.SimpleDateFormat
import java.util.*

class CalendarWidgetProvider : AppWidgetProvider() {

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
        val views = RemoteViews(context.packageName, R.layout.widget_calendar)

        // Set click to open the app on the calendar tab
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("screen", "calendar")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_calendar_root, pendingIntent)

        // Show today's date in header
        val today = SimpleDateFormat("EEEE, MMM d", Locale.getDefault()).format(Date())
        views.setTextViewText(R.id.widget_calendar_date, today)

        // Fetch events in background
        CoroutineScope(Dispatchers.IO).launch {
            val session = WidgetSessionManager.load(context)
            
            if (session == null || !session.isValid()) {
                views.setTextViewText(R.id.widget_calendar_events, "Open app to sign in")
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return@launch
            }

            val events = SupabaseWidgetClient.fetchUpcomingEvents(session, 7)
            
            val text = if (events.isEmpty()) {
                "Nothing scheduled"
            } else {
                events.take(5).joinToString("\n") { event ->
                    val emoji = if (event.isAnniversary) "🎂 " else ""
                    val time = event.eventTime?.let { " · $it" } ?: ""
                    val dateLabel = formatDateLabel(event.eventDate)
                    "$emoji${event.title}$time\n$dateLabel"
                }
            }

            views.setTextViewText(R.id.widget_calendar_events, text)
            appWidgetManager.updateAppWidget(appWidgetId, views)
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
