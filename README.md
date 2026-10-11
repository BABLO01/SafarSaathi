# Safar Saathi — Travel Companion PWA

A polished mobile-first Progressive Web App with soft glass UI, smooth animations, interactive OpenStreetMap (Leaflet), city maps for **Karachi, Hyderabad & Moro**, saved places, trips, Safar Check-in, GPS, compass, themes, and installable app shell.

**Developer by Muhammad Osman**

## What's improved
- Professional logo (clear location pin)
- Real interactive map (Leaflet + OpenStreetMap tiles)
- City cards: Karachi, Hyderabad, **Moro** with nicer entrance & hover animations
- Cleaner, more professional motion and transitions
- Accurate offline/online messaging

## Run locally
Service workers and geolocation need a secure context (localhost or HTTPS):

```bash
python -m http.server 8000
```
Open http://localhost:8000

## Deploy to GitHub Pages
1. Push all files (including `assets/`) to the repository root.
2. Enable GitHub Pages (Settings → Pages → Deploy from branch).
3. Open the HTTPS URL on Android Chrome.
4. Install via browser menu if the install prompt does not appear.

## Feature boundaries
- **Online**: Interactive map tiles, search, external walking/driving directions.
- **Offline**: App shell, saved places, trips, safety check-ins, themes, GPS (after permission), compass.
- Full offline map tile packs for entire cities are **not** bundled (would require large downloads).
- Live remote tracking / automatic alerts need a backend (not included).

## Privacy
Location is requested only when you tap a location action. Data stays on this device unless you export or share it.
