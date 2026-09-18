# AgriPlus

Interactive React + Vite agricultural decision-support dashboard.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Production build

```bash
npm run build
npm run preview
```

## Deploy

This is a standard Vite app. Build output is created in `dist/`.

For Netlify/Vercel/static hosting:
- Build command: `npm run build`
- Publish/output directory: `dist`

## Next integration work

The current UI contains working local interactions and prototype flows. Connect:
- Supabase Auth/database for persistent farm data
- Secure server/serverless endpoint for AI credentials
- Gemini or another multimodal model for image/text analysis
- Open-Meteo for live weather
- Real agricultural datasets where useful

Never expose secret API keys in `VITE_` environment variables.
