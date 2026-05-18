package com.oglife.app.widgets

import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.oglife.app.R

class CalendarWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        CalendarRemoteViewsFactory(applicationContext)
}

class CalendarRemoteViewsFactory(
    private val context: android.content.Context,
) : RemoteViewsService.RemoteViewsFactory {

    private var events: List<CalendarEventWidget> = emptyList()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        events = when (WidgetDataCache.calendarState) {
            WidgetDataCache.State.OK -> WidgetDataCache.calendarEvents
            else -> emptyList()
        }
    }

    override fun onDestroy() {
        events = emptyList()
    }

    override fun getCount(): Int = events.size

    override fun getViewAt(position: Int): RemoteViews {
        val event = events[position]
        val views = RemoteViews(context.packageName, R.layout.widget_calendar_item)

        val prefix = if (event.isAnniversary) "🎂 " else ""
        views.setTextViewText(R.id.item_title, prefix + event.title)
        views.setTextViewText(R.id.item_time, WidgetFormat.formatEventTime(event.eventTime))
        views.setTextViewText(R.id.item_when, WidgetFormat.formatDateLabel(event.eventDate))

        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long =
        (events[position].id + events[position].eventDate).hashCode().toLong()

    override fun hasStableIds(): Boolean = true
}
