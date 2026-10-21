# Gask

A clean, responsive gas-price comparison frontend built with Next.js, React, TypeScript, and Lucide icons.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. Run `npm run build` for a production build, or `npm run typecheck` to check TypeScript.

## Features

- Location input and browser geolocation
- Fuel selection, distance filtering, and sorting by price or distance
- Saved stations persisted in local storage
- Interactive illustrative map linked to station selection
- Directions through Google Maps
- Responsive desktop and mobile layouts

This is frontend-only: station prices, distances, hours, and positions are sample San Francisco data. Searching another location or using geolocation does not fetch live stations. The interface explicitly labels this limitation. A live station provider and geocoding can be connected later.
