package com.oglife.app.widgets

import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.oglife.app.R

class ShoppingWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        ShoppingRemoteViewsFactory(applicationContext)
}

class ShoppingRemoteViewsFactory(
    private val context: android.content.Context,
) : RemoteViewsService.RemoteViewsFactory {

    private var items: List<ShoppingItemWidget> = emptyList()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        items = when (WidgetDataCache.shoppingState) {
            WidgetDataCache.State.OK -> WidgetDataCache.shoppingItems
            else -> emptyList()
        }
    }

    override fun onDestroy() {
        items = emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = items[position]
        val views = RemoteViews(context.packageName, R.layout.widget_shopping_item)
        views.setTextViewText(R.id.item_name, item.name)
        if (!item.quantity.isNullOrBlank()) {
            views.setTextViewText(R.id.item_quantity, item.quantity)
            views.setViewVisibility(R.id.item_quantity, android.view.View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.item_quantity, android.view.View.GONE)
        }
        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = items[position].id.hashCode().toLong()

    override fun hasStableIds(): Boolean = true
}
