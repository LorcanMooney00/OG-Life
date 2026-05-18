package com.oglife.app.widgets

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

data class CalendarEventWidget(
    val id: String,
    val title: String,
    val eventDate: String,
    val eventTime: String?,
    val isAnniversary: Boolean
)

data class ShoppingItemWidget(
    val id: String,
    val name: String,
    val quantity: String?,
    val purchased: Boolean
)

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
            .addHeader("Content-Type", "application/json")
            .build()
    }

    fun fetchTodayEvents(session: WidgetSession): List<CalendarEventWidget> {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        
        // Fetch events for today (simplified: only non-recurring for widget)
        // The full recurrence expansion happens in the app; widget shows basics
        val endpoint = "calendar_events?event_date=eq.$today&select=id,title,event_date,event_time,is_anniversary&order=event_time.asc.nullslast"
        
        val request = buildRequest(session, endpoint)
        
        return try {
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            
            val body = response.body?.string() ?: return emptyList()
            val arr = JSONArray(body)
            
            (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                CalendarEventWidget(
                    id = obj.optString("id", ""),
                    title = obj.optString("title", "Untitled"),
                    eventDate = obj.optString("event_date", ""),
                    eventTime = obj.optString("event_time", null),
                    isAnniversary = obj.optBoolean("is_anniversary", false)
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun fetchUpcomingEvents(session: WidgetSession, days: Int = 7): List<CalendarEventWidget> {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = sdf.format(Date())
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, days)
        val endDate = sdf.format(cal.time)
        
        val endpoint = "calendar_events?event_date=gte.$today&event_date=lte.$endDate&select=id,title,event_date,event_time,is_anniversary&order=event_date.asc,event_time.asc.nullslast&limit=10"
        
        val request = buildRequest(session, endpoint)
        
        return try {
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            
            val body = response.body?.string() ?: return emptyList()
            val arr = JSONArray(body)
            
            (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                CalendarEventWidget(
                    id = obj.optString("id", ""),
                    title = obj.optString("title", "Untitled"),
                    eventDate = obj.optString("event_date", ""),
                    eventTime = obj.optString("event_time", null),
                    isAnniversary = obj.optBoolean("is_anniversary", false)
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun fetchShoppingItems(session: WidgetSession): List<ShoppingItemWidget> {
        val endpoint = "shopping_items?purchased=eq.false&select=id,item_name,quantity,purchased&order=sort_order.asc.nullslast,created_at.asc&limit=10"
        
        val request = buildRequest(session, endpoint)
        
        return try {
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            
            val body = response.body?.string() ?: return emptyList()
            val arr = JSONArray(body)
            
            (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                ShoppingItemWidget(
                    id = obj.optString("id", ""),
                    name = obj.optString("item_name", "Item"),
                    quantity = obj.optString("quantity", null),
                    purchased = obj.optBoolean("purchased", false)
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
