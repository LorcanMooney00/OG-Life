package com.oglife.app.widgets

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

object WidgetFormat {

    fun headerDate(): String =
        SimpleDateFormat("EEE, MMM d", Locale.getDefault()).format(Date())

    fun formatDateLabel(dateStr: String): String {
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val date = sdf.parse(dateStr) ?: return dateStr

            val today = Calendar.getInstance()
            val eventCal = Calendar.getInstance().apply { time = date }
            eventCal.set(Calendar.HOUR_OF_DAY, 0)
            eventCal.set(Calendar.MINUTE, 0)
            eventCal.set(Calendar.SECOND, 0)
            eventCal.set(Calendar.MILLISECOND, 0)
            today.set(Calendar.HOUR_OF_DAY, 0)
            today.set(Calendar.MINUTE, 0)
            today.set(Calendar.SECOND, 0)
            today.set(Calendar.MILLISECOND, 0)

            val diffDays =
                ((eventCal.timeInMillis - today.timeInMillis) / (1000 * 60 * 60 * 24)).toInt()

            when {
                diffDays == 0 -> "Today"
                diffDays == 1 -> "Tomorrow"
                diffDays in 2..6 -> SimpleDateFormat("EEEE", Locale.getDefault()).format(date)
                else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(date)
            }
        } catch (_: Exception) {
            dateStr
        }
    }

    fun formatEventTime(eventTime: String?): String {
        if (eventTime.isNullOrBlank()) return "Day"
        // event_time is stored as HH:mm in the app
        return try {
            val parts = eventTime.split(":")
            if (parts.size >= 2) {
                val hour = parts[0].toInt()
                val minute = parts[1].toInt()
                val cal = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, hour)
                    set(Calendar.MINUTE, minute)
                }
                SimpleDateFormat("h:mm a", Locale.getDefault()).format(cal.time)
            } else {
                eventTime
            }
        } catch (_: Exception) {
            eventTime
        }
    }
}
