# Tracker — Macro, Calorie & Workout PWA

A high-performance personal fitness tracker inspired by Apple Health & Fitness. Built as a progressive web application (PWA) with a pure-black aesthetic, zero runtime dependencies, and seamless synchronization across devices.

Live application: [tracker-wheat-eight.vercel.app/macros.html](https://tracker-wheat-eight.vercel.app/macros.html)

---

## Architecture & Tech Stack

- **Frontend (`public/macros.html`)**: Standalone vanilla JavaScript SPA/PWA with Apple HIG styling, SVG charts, and local-first persistence.
- **Backend API (`src/routes/api/sync.ts` & `src/routes/api/scan.ts`)**: Serverless endpoints running on Vercel:
  - `/api/sync`: Manages external synchronization for Apple Health calorie burn and cloud state.
  - `/api/scan`: AI food scanner endpoint.
- **Storage**: Dual-tier storage architecture:
  - **Local**: `localStorage` for instant load, offline capability, and client preferences.
  - **Cloud**: GitHub Gist JSON storage for persistent multi-device synchronization.

---

## Core Application Modules

### 1. Today Tab (Daily Intake & Burn)
- **Calorie Rings**: Side-by-side rings showing:
  - **Intake Ring**: Calories eaten vs. daily target.
  - **Burned Ring**: Active energy expended synced from Apple Health.
- **Nutrient Breakdown**: Macro tracking for Protein, Carbohydrates, and Fats with progress bars and remaining gram targets.
- **Meal Logger**: Quick addition and deletion of food items with real-time recalculation.
- **Goal Customization**: In-app editing of calorie and macro targets.

### 2. Calendar Tab (Trends & History)
- **Monthly Grid**: Visual calendar showing days with logged meals and status.
- **Calorie Trend Chart (SVG)**:
  - **Week Mode**: Displays the current calendar week (Monday through Sunday) and automatically resets every Monday. Past days with entries are connected with a smooth green trend line; future days remain cleanly plotted without zero-drops.
  - **Month Mode**: Displays the current calendar month from day 1 to month-end, resetting on the 1st of each month.
  - **Goal & Average Guides**: Includes a dashed green daily goal reference line and a translucent red average line calculated over logged days.
- **Net vs. Food-Only Toggle**: A title-bar toggle that switches between:
  - **Net Calories**: Eaten calories minus Apple Health active burned calories.
  - **Food Only**: Raw consumed calories.
- **Weekly & Monthly Aggregates**: Real-time stats comparing accumulated intake against cumulative targets.

### 3. Gym Tab (Workout Routines & Progression)
- **Automatic Day Selection**: Automatically opens the current weekday's workout schedule (Monday through Friday) and marks it with a `TODAY` badge.
- **Exercise List & Weight Adjustment**: Interactive `+` and `-` controls to increment or decrement exercise weights in 2.5 kg steps.
- **Progression History Chart**: Clicking on any exercise reveals a six-week progression line graph showing historical weight increases.

---

## Apple Health / Fitness Integration (iOS Shortcuts)

To sync calories burned from Apple Fitness without native app permissions, Tracker uses an iOS Shortcut automation.

### Sync Endpoint
- **URL**: `https://tracker-wheat-eight.vercel.app/api/sync?key=steps`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "cal": 650
}
```

### iOS Shortcut Configuration
1. **Find Health Samples**:
   - Type: `Active Energy`
   - Start Date: `is today`
2. **Calculate Statistics**:
   - Operation: `Sum` of Health Samples
3. **Round Number**:
   - Mode: `Round to ones place` (prevents localization comma issues like `68,5` turning into `6850`)
4. **Get Contents of URL**:
   - URL: `https://tracker-wheat-eight.vercel.app/api/sync?key=steps`
   - Method: `POST`
   - Request Body: JSON with field `cal` set to the rounded number
5. **Automation**:
   - Set an automation in Shortcuts to run the shortcut automatically every evening (e.g., 22:00) with **Run Immediately** enabled.

---

## Code Organization (`public/macros.html`)

The main application code is structured into clear sections:

| Section | Description |
|---|---|
| **State (`S`) & Defaults** | Application state holding current tab, goals, loaded month data, active date, and gym routines. |
| **Persistence (`save()`, `loadMonth()`, `cloudSync()`)** | Syncs state between `localStorage` and the GitHub Gist backend. |
| **Health Sync (`fetchHealthBurned()`, `getBurned()`)** | Pulls and caches active energy burned from the `/api/sync` route. |
| **Views (`todayHtml()`, `calHtml()`, `gymHtml()`)** | Template generators for each of the primary application tabs. |
| **Charts (`calorieChartHtml()`, `progressionChartHtml()`)** | Dynamic SVG charting for calorie trends and weight progressions. |
| **Event Handlers & Interactivity** | Functions for meal entry, goal updates, exercise weight increments, and date selection. |

---

## Versioning

The application displays its current version number at the bottom of the **Today** screen (e.g., `v1.15`). Each production release increments by `+0.01`.
