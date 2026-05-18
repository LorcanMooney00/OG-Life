package com.oglife.app.widgets

/**
 * In-memory cache populated by widget providers before refreshing list views.
 * RemoteViewsFactory reads from here on the main binder thread.
 */
object WidgetDataCache {

    enum class State {
        LOADING,
        OK,
        EMPTY,
        SIGNED_OUT,
        ERROR,
    }

    @Volatile
    var shoppingItems: List<ShoppingItemWidget> = emptyList()

    @Volatile
    var shoppingState: State = State.LOADING

    @Volatile
    var shoppingMessage: String = "Loading…"

    @Volatile
    var calendarEvents: List<CalendarEventWidget> = emptyList()

    @Volatile
    var calendarState: State = State.LOADING

    @Volatile
    var calendarMessage: String = "Loading…"

    fun setShopping(items: List<ShoppingItemWidget>, state: State, message: String) {
        shoppingItems = items
        shoppingState = state
        shoppingMessage = message
    }

    fun setCalendar(events: List<CalendarEventWidget>, state: State, message: String) {
        calendarEvents = events
        calendarState = state
        calendarMessage = message
    }
}
