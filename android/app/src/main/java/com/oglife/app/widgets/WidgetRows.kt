package com.oglife.app.widgets

import android.view.View
import android.widget.RemoteViews
import com.oglife.app.R

object WidgetRows {

    private val shoppingRowIds = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4)
    private val shoppingNameIds = intArrayOf(R.id.row0_name, R.id.row1_name, R.id.row2_name, R.id.row3_name, R.id.row4_name)

    private val calendarRowIds = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3)
    private val calendarTimeIds = intArrayOf(R.id.row0_time, R.id.row1_time, R.id.row2_time, R.id.row3_time)
    private val calendarTitleIds = intArrayOf(R.id.row0_title, R.id.row1_title, R.id.row2_title, R.id.row3_title)
    private val calendarWhenIds = intArrayOf(R.id.row0_when, R.id.row1_when, R.id.row2_when, R.id.row3_when)

    fun bindShopping(
        views: RemoteViews,
        items: List<ShoppingItemWidget>,
        emptyMessage: String,
    ) {
        if (items.isEmpty()) {
            views.setViewVisibility(R.id.widget_rows, View.GONE)
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setTextViewText(R.id.widget_empty, emptyMessage)
            return
        }

        views.setViewVisibility(R.id.widget_rows, View.VISIBLE)
        views.setViewVisibility(R.id.widget_empty, View.GONE)

        for (i in shoppingRowIds.indices) {
            if (i < items.size) {
                val item = items[i]
                views.setViewVisibility(shoppingRowIds[i], View.VISIBLE)
                val label = item.quantity?.let { "${item.name}  ·  $it" } ?: item.name
                views.setTextViewText(shoppingNameIds[i], label)
            } else {
                views.setViewVisibility(shoppingRowIds[i], View.GONE)
            }
        }
    }

    fun bindCalendar(
        views: RemoteViews,
        events: List<CalendarEventWidget>,
        emptyMessage: String,
    ) {
        if (events.isEmpty()) {
            views.setViewVisibility(R.id.widget_rows, View.GONE)
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setTextViewText(R.id.widget_empty, emptyMessage)
            return
        }

        views.setViewVisibility(R.id.widget_rows, View.VISIBLE)
        views.setViewVisibility(R.id.widget_empty, View.GONE)

        for (i in calendarRowIds.indices) {
            if (i < events.size) {
                val event = events[i]
                views.setViewVisibility(calendarRowIds[i], View.VISIBLE)
                val prefix = if (event.isAnniversary) "🎂 " else ""
                views.setTextViewText(calendarTitleIds[i], prefix + event.title)
                views.setTextViewText(calendarTimeIds[i], WidgetFormat.formatEventTime(event.eventTime))
                views.setTextViewText(calendarWhenIds[i], WidgetFormat.formatDateLabel(event.eventDate))
            } else {
                views.setViewVisibility(calendarRowIds[i], View.GONE)
            }
        }
    }
}
