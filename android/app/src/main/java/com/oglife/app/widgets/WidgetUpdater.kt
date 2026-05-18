package com.oglife.app.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

object WidgetUpdater {
    
    fun refreshAllWidgets(ctx: Context) {
        refreshCalendarWidget(ctx)
        refreshShoppingWidget(ctx)
    }

    fun refreshCalendarWidget(ctx: Context) {
        val intent = Intent(ctx, CalendarWidgetProvider::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        }
        val widgetManager = AppWidgetManager.getInstance(ctx)
        val ids = widgetManager.getAppWidgetIds(
            ComponentName(ctx, CalendarWidgetProvider::class.java)
        )
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        ctx.sendBroadcast(intent)
    }

    fun refreshShoppingWidget(ctx: Context) {
        val intent = Intent(ctx, ShoppingWidgetProvider::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        }
        val widgetManager = AppWidgetManager.getInstance(ctx)
        val ids = widgetManager.getAppWidgetIds(
            ComponentName(ctx, ShoppingWidgetProvider::class.java)
        )
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        ctx.sendBroadcast(intent)
    }
}
