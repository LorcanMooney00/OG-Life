# OG Life

A shared calendar and shopping list app for couples. Built with React + TypeScript + Vite, deployed as a PWA on Vercel, with optional Android native app for home screen widgets.

## Quick Start (Web)

```bash
npm install
npm run dev
```

Create a `.env` file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SITE_URL=https://your-vercel-url.vercel.app
VITE_ONESIGNAL_APP_ID=your-onesignal-app-id
```

## Android App with Widgets

The Android app wraps the same web app but adds **home screen widgets** for Calendar and Shopping that work even when the app is closed.

### Prerequisites

- [Android Studio](https://developer.android.com/studio) (latest stable)
- JDK 17+

### Build & Run

```bash
# Build web + sync to Android
npm run android
```

This opens Android Studio. Then:

1. Connect your phone via USB (enable USB debugging)
2. Click **Run** (green play button)
3. The app installs on your phone

### Adding Widgets

1. Open the OG Life app and **sign in** (this stores your session for the widgets)
2. Long-press your home screen → **Widgets**
3. Find **OG Life** → drag **OG Calendar** or **OG Shopping** to your home screen
4. The widget loads your data from Supabase

### How It Works

- When you sign in, the web app calls the native `OgWidgets.syncSession()` plugin
- Your Supabase access token is stored in Android SharedPreferences
- Widgets read that token and call PostgREST directly (no WebView needed)
- Widgets auto-refresh every 30 minutes, plus instantly when you change data in the app

### Sideloading the APK

To share with your partner without the Play Store:

1. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Find the APK in `android/app/build/outputs/apk/debug/app-debug.apk`
3. Send it to your partner (AirDrop, email, cloud link)
4. On their phone: open the APK and allow "Install from unknown sources"

## Project Structure

```
src/                  # React web app
android/              # Capacitor Android shell + widgets
  app/src/main/
    java/com/oglife/app/
      MainActivity.kt           # Capacitor bridge + plugin registration
      OgWidgetsPlugin.kt        # Receives session from web
      widgets/
        CalendarWidgetProvider.kt
        ShoppingWidgetProvider.kt
        WidgetSessionManager.kt  # SharedPreferences storage
        SupabaseWidgetClient.kt  # HTTP calls to PostgREST
    res/
      layout/widget_*.xml       # Widget layouts
      xml/widget_*_info.xml     # Widget metadata
supabase/             # SQL schema, migrations, edge functions
```

## Supabase Setup

Run these in order in the Supabase SQL Editor:

1. `supabase/schema.sql` — tables, RLS, triggers
2. `supabase/rpc_calendar_month.sql` — efficient calendar queries
3. `supabase/push_partner_alerts.sql` — shopping/calendar push triggers
4. `supabase/calendar_event_reminders.sql` — 30-min-before reminders
5. `supabase/calendar_event_advance_reminders.sql` — day/week-before reminders

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (Postgres, Auth, Edge Functions)
- **Push**: OneSignal
- **Native**: Capacitor (Android)
