package com.oglife.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.oglife.app.MainActivity
import com.oglife.app.R
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
        try {
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

            // Just show static content for now - no network calls
            views.setTextViewText(R.id.widget_calendar_events, "Tap to open calendar")

            appWidgetManager.updateAppWidget(appWidgetId, views)
        } catch (e: Exception) {
            // Silently fail
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
