# AgriPlus

Interactive React + Vite agricultural decision-support dashboard.

## Run locally with the AI assistant

```bash
npm install
npm run dev
```

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys). Copy `.env.example` to `.env` and replace the placeholder with your key:

```env
GEMINI_API_KEY=your_private_key
```

Keep `.env` private and never put the key in frontend code or a `VITE_` variable. The development command starts both the Vite app and a local API server; the app proxies chat requests to the server. If you change `.env`, restart the development server.

## Language preferences

The app interface supports English (default), Hausa, and Nigerian Pidgin. Choose a language from **Settings**; the selection is saved in this browser and applies immediately without reloading or clearing page state. AI response language follows the interface by default and can be set separately in **Settings → AI Preferences**. AI language instructions are sent to the server with each chat request and are never exposed as frontend credentials. Voice preferences are shown as future functionality only; voice input and playback are not implemented.

## In-app farm alerts

Alerts are generated from saved crop and livestock schedules, calendar events, health concerns farmers record, new farm records, and AI recommendations the farmer chooses to save. Alert history, farm records, calendar events, and notification preferences are stored in the current browser's local storage and synchronized between open tabs on that browser. They are not synced between devices or tied to an authenticated account, so this is not suitable for shared-browser, multi-farmer use.

Crop watering, growth-stage, and harvest dates, as well as livestock vaccination, checkup, and feeding dates, can be entered when adding records. Upcoming dates within two days generate a single reminder while the app is open. Weather forecasts are available, but weather-triggered alert rules are not implemented. Browser/mobile push and email delivery are not configured. Supabase/Auth and a persistent private database must be integrated before account-scoped cross-device history, server-driven realtime alerts, or external delivery channels can be provided securely.

## Weather and location

The Weather page requests browser geolocation when no saved location is available, and also lets farmers search Nigerian towns or select any of Plateau State's 17 LGAs. Forecasts are fetched from Open-Meteo without an API key; selected coordinates are sent to the provider. Weather is a model-based estimate for nearby grid coordinates, not an observation from a station at the farm. Free Open-Meteo API use is limited to non-commercial projects; check its current licence and obtain an appropriate subscription before commercial deployment.

## Production build

```bash
npm run build
npm run preview
```

## Deploy

This is a standard Vite app. Build output is created in `dist/`.

The frontend build is created in `dist/`. The chat API requires the Node server in `server.js` to run with `GEMINI_API_KEY` configured in the hosting provider's server-side environment variables. A static-only deployment will not provide the chat API.

## Supabase setup

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for Supabase Auth configuration, database migrations, RLS, OAuth/SMS setup, Storage, and server deployment requirements. When configured, authentication, crop/livestock records, calendar, community, and notifications use Supabase. The farmer dashboard is at `/dashboard`; the separate role-protected admin area is at `/admin/login`. Admin access additionally requires the server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPER_ADMIN_EMAIL` settings described in the setup guide. AI conversation and diagnosis history, and several other prototype pages, are not yet cloud-backed. Until configured, the app clearly remains browser-local; do not treat local storage as private cloud persistence.

Never expose secret API keys in `VITE_` environment variables.
