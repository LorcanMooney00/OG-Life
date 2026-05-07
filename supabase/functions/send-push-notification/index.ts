// OneSignal push for OG Life — targets partner by external_id (Supabase user id from OneSignal.login).
// Called from Postgres (pg_net). Requires header x-og-push-secret matching OG_PUSH_WEBHOOK_SECRET.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-og-push-secret',
}

/** New keys use `Key …`; Legacy REST keys use HTTP Basic (API key + colon, base64). */
function oneSignalAuthHeader(restKey: string): string {
  const k = restKey.trim()
  if (k.startsWith('Basic ')) return k
  if (k.startsWith('os_v2_')) return `Key ${k}`
  return `Basic ${btoa(`${k}:`)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookSecret = Deno.env.get('OG_PUSH_WEBHOOK_SECRET') || ''
    if (!webhookSecret || req.headers.get('x-og-push-secret') !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      type = 'event',
      event_id,
      shopping_id,
      user_id,
      title,
      item_name,
      event_date,
      event_time,
      reminder,
    } = body

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const appId = Deno.env.get('ONESIGNAL_APP_ID') || ''
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY') || ''
    const siteBase = (Deno.env.get('APP_PUBLIC_URL') || '').replace(/\/$/, '')

    if (!appId || !restKey) {
      return new Response(
        JSON.stringify({ error: 'Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let heading = 'OG Life'
    let content = 'New update'
    let path = '/app'

    switch (type) {
      case 'shopping':
        heading = 'New shopping item'
        content = item_name || 'Something was added to your list'
        path = '/app?screen=shopping'
        break
      case 'event': {
        const isReminder = reminder === true
        heading = isReminder ? 'Event starting soon' : 'New calendar event'
        if (isReminder) {
          const timeStr =
            event_time && typeof event_time === 'string'
              ? (() => {
                  try {
                    return new Date(`2000-01-01T${event_time}`).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  } catch {
                    return event_time
                  }
                })()
              : ''
          content = title
            ? `${title} starts in 30 minutes${timeStr ? ` (${timeStr})` : ''}`
            : 'A calendar event starts in 30 minutes'
        } else {
          const dateStr = event_date
            ? new Date(String(event_date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : ''
          content = title
            ? `${title}${dateStr ? ` on ${dateStr}` : ''}${event_time ? ` at ${event_time}` : ''}`
            : 'New event on your calendar'
        }
        path = '/app?screen=calendar'
        break
      }
      default:
        heading = 'OG Life'
        content = title || item_name || 'New update'
    }

    const openUrl = siteBase ? `${siteBase}${path}` : path

    const oneSignalBody = {
      app_id: appId,
      target_channel: 'push',
      include_aliases: {
        external_id: [String(user_id)],
      },
      headings: { en: heading },
      contents: { en: content },
      data: {
        type,
        event_id: event_id ?? null,
        shopping_id: shopping_id ?? null,
        url: path,
      },
      url: openUrl,
    }

    const osRes = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: oneSignalAuthHeader(restKey),
      },
      body: JSON.stringify(oneSignalBody),
    })

    if (!osRes.ok) {
      const errText = await osRes.text()
      console.error('OneSignal error', osRes.status, errText)
      return new Response(
        JSON.stringify({ error: `OneSignal ${osRes.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await osRes.json()
    return new Response(
      JSON.stringify({
        message: 'Sent',
        oneSignal: result,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
