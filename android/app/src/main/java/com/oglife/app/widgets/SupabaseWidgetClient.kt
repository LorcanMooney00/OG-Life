package com.oglife.app.widgets

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

data class CalendarEventWidget(
    val id: String,
    val title: String,
    val eventDate: String,
    val eventTime: String?,
    val isAnniversary: Boolean,
)

data class ShoppingItemWidget(
    val id: String,
    val name: String,
    val quantity: String?,
    val purchased: Boolean,
)

sealed class WidgetFetchResult<T> {
    data class Success<T>(val data: T) : WidgetFetchResult<T>()
    data class Failure<T>(val httpCode: Int, val hint: String) : WidgetFetchResult<T>()
}

object SupabaseWidgetClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private fun buildRequest(session: WidgetSession, endpoint: String): Request {
        return Request.Builder()
            .url("${session.supabaseUrl}/rest/v1/$endpoint")
            .addHeader("apikey", session.anonKey)
            .addHeader("Authorization", "Bearer ${session.accessToken}")
            .addHeader("Accept", "application/json")
            .get()
            .build()
    }

    private fun httpGet(session: WidgetSession, endpoint: String): Pair<Int, String?> {
        val response = client.newCall(buildRequest(session, endpoint)).execute()
        return response.code to response.body?.string()
    }

    fun fetchTodayEvents(session: WidgetSession): List<CalendarEventWidget> {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val endpoint =
            "calendar_events?event_date=eq.$today" +
                "&select=id,title,event_date,event_time,is_anniversary" +
                "&order=event_time.asc.nullslast"

        val (code, body) = httpGet(session, endpoint)
        if (code != 200 || body == null) return emptyList()
        return parseCalendarEvents(body)
    }

    fun fetchUpcomingEvents(session: WidgetSession, days: Int = 7): List<CalendarEventWidget> {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = sdf.format(Date())
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, days)
        val endDate = sdf.format(cal.time)

        val endpoint =
            "calendar_events?event_date=gte.$today&event_date=lte.$endDate" +
                "&select=id,title,event_date,event_time,is_anniversary" +
                "&order=event_date.asc,event_time.asc.nullslast&limit=10"

        val (code, body) = httpGet(session, endpoint)
        if (code != 200 || body == null) return emptyList()
        return parseCalendarEvents(body)
    }

    /**
     * Mirrors the web app: fetch all linked rows, filter unpurchased in Kotlin.
     * Tries sort_order ordering first, then falls back to created_at only.
     */
    fun fetchShoppingItems(session: WidgetSession): WidgetFetchResult<List<ShoppingItemWidget>> {
        val endpoints = listOf(
            "shopping_items?select=id,item_name,quantity,purchased" +
                "&order=sort_order.asc,created_at.asc&limit=50",
            "shopping_items?select=id,item_name,quantity,purchased" +
                "&order=created_at.asc&limit=50",
        )

        var lastCode = 0
        var lastHint = ""

        for (endpoint in endpoints) {
            val (code, body) = httpGet(session, endpoint)
            if (code == 200 && body != null) {
                val active = parseShoppingItems(body).filter { !it.purchased }
                return WidgetFetchResult.Success(active)
            }
            lastCode = code
            lastHint = body?.take(120) ?: "empty response"
        }

        return WidgetFetchResult.Failure(lastCode, lastHint)
    }

    private fun parseCalendarEvents(body: String): List<CalendarEventWidget> {
        val arr = JSONArray(body)
        return (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            CalendarEventWidget(
                id = obj.optString("id", ""),
                title = obj.optString("title", "Untitled"),
                eventDate = obj.optString("event_date", ""),
                eventTime = obj.optString("event_time").takeIf { it.isNotBlank() },
                isAnniversary = obj.optBoolean("is_anniversary", false),
            )
        }
    }

    private fun parseShoppingItems(body: String): List<ShoppingItemWidget> {
        val arr = JSONArray(body)
        return (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            val qty = obj.optString("quantity", "").trim().ifBlank { "1" }
            ShoppingItemWidget(
                id = obj.optString("id", ""),
                name = obj.optString("item_name", "Item"),
                quantity = qty,
                purchased = obj.optBoolean("purchased", false),
            )
        }
    }
}
