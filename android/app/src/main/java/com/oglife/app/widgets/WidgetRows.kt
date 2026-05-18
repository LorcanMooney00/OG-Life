package com.oglife.app.widgets

import android.view.View
import android.widget.RemoteViews
import com.oglife.app.R

object WidgetRows {

    private val shoppingRowIds = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4)
    private val calendarRowIds = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3)

    fun bindShopping(
        views: RemoteViews,
        items: List<ShoppingItemWidget>,
        emptyMessage: String,
    ) {
        hideAllRows(views, shoppingRowIds)

        if (items.isEmpty()) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setTextViewText(R.id.widget_empty, emptyMessage)
            return
        }

        views.setViewVisibility(R.id.widget_empty, View.GONE)

        for (i in shoppingRowIds.indices) {
            if (i < items.size) {
                val item = items[i]
                val qty = item.quantity?.trim()?.takeIf { it.isNotEmpty() } ?: "1"
                val line = "○  ${item.name}  ·  $qty"
                views.setTextViewText(shoppingRowIds[i], line)
                views.setViewVisibility(shoppingRowIds[i], View.VISIBLE)
            }
        }
    }

    fun bindCalendar(
        views: RemoteViews,
        events: List<CalendarEventWidget>,
        emptyMessage: String,
    ) {
        hideAllRows(views, calendarRowIds)

        if (events.isEmpty()) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setTextViewText(R.id.widget_empty, emptyMessage)
            return
        }

        views.setViewVisibility(R.id.widget_empty, View.GONE)

        for (i in calendarRowIds.indices) {
            if (i < events.size) {
                val event = events[i]
                val prefix = if (event.isAnniversary) "🎂 " else ""
                val time = WidgetFormat.formatEventTime(event.eventTime)
                val whenLabel = WidgetFormat.formatDateLabel(event.eventDate)
                val line = "$time   $prefix${event.title}\n$whenLabel"
                views.setTextViewText(calendarRowIds[i], line)
                views.setViewVisibility(calendarRowIds[i], View.VISIBLE)
            }
        }
    }

    private fun hideAllRows(views: RemoteViews, rowIds: IntArray) {
        for (id in rowIds) {
            views.setViewVisibility(id, View.GONE)
        }
    }
}
