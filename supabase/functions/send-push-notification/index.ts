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
      // Reminder variant — '30min' (default for legacy reminder=true),
      // 'day_before' for biweekly day-before, 'week_before' for yearly
      // week-before. Sent from the Postgres reminder fns.
      reminder_kind: reminderKind,
      // Marks anniversaries / birthdays so we can sprinkle an emoji and use
      // celebratory copy instead of the generic event template.
      is_anniversary: isAnniversaryRaw,
    } = body
    const isAnniversary = isAnniversaryRaw === true

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
        // Determine reminder variant: explicit reminder_kind wins; otherwise
        // legacy reminder=true means 30-minute reminder; otherwise it's a
        // "new event added" notification.
        const kind: 'new' | '30min' | 'day_before' | 'week_before' =
          reminderKind === 'day_before' ||
          reminderKind === 'week_before' ||
          reminderKind === '30min'
            ? reminderKind
            : reminder === true
              ? '30min'
              : 'new'

        const safeTitle = typeof title === 'string' ? title : ''
        const formatClock = (raw: unknown): string => {
          if (!raw || typeof raw !== 'string') return ''
          try {
            return new Date(`2000-01-01T${raw}`).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          } catch {
            return raw
          }
        }
        const formatDay = (raw: unknown): string => {
          if (!raw) return ''
          try {
            return new Date(String(raw)).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })
          } catch {
            return ''
          }
        }
        // Anniversary heuristic mirrors the client: cake for birthdays,
        // confetti for anything else flagged as an anniversary.
        const emoji = isAnniversary
          ? /birthday|bday|b-day/i.test(safeTitle)
            ? '🎂'
            : '🎉'
          : ''
        const titleWithEmoji = emoji ? `${emoji} ${safeTitle}` : safeTitle
        const timeStr = formatClock(event_time)

        if (kind === '30min') {
          heading = isAnniversary ? `${emoji} Starting soon` : 'Event starting soon'
          content = safeTitle
            ? `${titleWithEmoji} starts in 30 minutes${timeStr ? ` (${timeStr})` : ''}`
            : 'A calendar event starts in 30 minutes'
        } else if (kind === 'day_before') {
          heading = isAnniversary ? `${emoji} Tomorrow` : 'Tomorrow on your calendar'
          content = safeTitle
            ? `${titleWithEmoji}${timeStr ? ` · tomorrow at ${timeStr}` : ' · tomorrow'}`
            : 'You have an event tomorrow.'
        } else if (kind === 'week_before') {
          const dayStr = formatDay(event_date)
          heading = isAnniversary ? `${emoji} One week to go` : 'Coming up next week'
          content = safeTitle
            ? `${titleWithEmoji}${dayStr ? ` · ${dayStr}` : ' · next week'}`
            : 'You have an event coming up next week.'
        } else {
          // Brand-new event (created or edited)
          heading = isAnniversary ? `${emoji} New anniversary` : 'New calendar event'
          const dateStr = event_date
            ? new Date(String(event_date)).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : ''
          content = safeTitle
            ? `${titleWithEmoji}${dateStr ? ` on ${dateStr}` : ''}${event_time ? ` at ${event_time}` : ''}`
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
