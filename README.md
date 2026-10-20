# Orbit

Orbit is a local-first workout tracker built with HTML, JavaScript, and Tailwind CSS. It uses the supplied exercise catalogue and saves workout data in this browser; it has no account, backend or cloud sync.

## Run locally

```powershell
npm install
npm run dev
```

The development server uses Node's built-in HTTP modules and serves the project files at `http://localhost:4173`. In a second terminal, run `npm run css:watch` to rebuild Tailwind CSS automatically while editing. Or run `npm run css` to generate the stylesheet once.

Create a static production build with `npm run build`, then deploy the contents of `dist/`. The build copies the HTML, JavaScript, generated CSS, and `workout.json` without bundling or transforming the app. Preview that output with `npm run preview`.

The exercise catalogue and its ID-matched images are loaded from root-level `workout.json` and `workout-images/` using URLs relative to the page. Keep them alongside `index.html` in development; the static build copies both into `dist/`.

## Included

- First-run profile onboarding and responsive light-mode navigation.
- Workout templates with a searchable, category-filtered exercise catalogue.
- Persisted active workout sessions, previous set performance and completed session history.
- Estimated one-rep max tracking, retained best-set records and personal record events.
- Progress chart, calendar workout counts and exercise history.
- Kilogram/pound display preference, JSON export/import and scoped data deletion.

Orbit stores information in this browser's localStorage. Export backups yourself; data is not synced or automatically backed up. The exercise performance history retains up to 30 best-set records per exercise.
