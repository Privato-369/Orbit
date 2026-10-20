# Orbit

**A free, local-first workout tracker built to make workout logging and progress tracking accessible to everyone.**

Orbit is a workout-tracking web application designed to help users create workout routines, record their training sessions, and monitor their progress over time. It uses a local exercise dataset containing approximately **440 exercises**, with corresponding exercise images, to make browsing and selecting exercises easier.

## Features

- **Workout Management:** Create, edit, reorder, and delete custom workouts.
- **Exercise Library:** Browse approximately 440 exercises using locally stored exercise metadata.
- **Exercise Images:** View exercise images matched to their metadata using unique exercise IDs.
- **Workout Tracking:** Record sets, repetitions, and weights during workout sessions.
- **Previous Session Data:** Compare current sets with the previous session's performance.
- **Progress Dashboard:** View workout statistics, exercise progress graphs, and personal records.
- **Exercise History:** Review historical performance and track improvements over time.
- **Personal Records:** Track achievements such as heaviest sets, repetition records, and estimated strength.
- **Data Backup:** Export workout data as JSON and import it when moving to another device.
- **Local Data Storage:** Keep workout data in the browser without requiring a personal account on a remote server.

## Tech Stack

- HTML
- CSS
- JavaScript
- Tailwind CSS
- Browser `localStorage`
- JSON for exercise metadata and data backup

### Exercise Dataset

The `workout.json` file contains exercise metadata, including fields such as:

- `id`: Unique exercise identifier.
- `name`: Exercise name.
- `category`: Exercise category.
- `primaryMuscle`: Primary muscle targeted.
- `secondaryMuscles`: Additional muscles involved.

The dataset contains approximately **440 exercises**.

### Exercise Images

The `workout-images` directory stores the corresponding exercise images. Each image is associated with an exercise through its ID.

For example, an exercise with the ID `00001` uses an image whose filename begins with `00001`.

Exercise IDs must retain their leading zeros. Images are stored locally rather than retrieved from an external image service.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- npm

### Installation

Clone the repository:

```bash
git clone <repository-url>
cd Orbit
```

Install the project dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed in the terminal to use the application.

The commands above assume the project uses the corresponding npm scripts. Check `package.json` if the available commands differ.

## How Data Is Stored

Orbit uses the browser's `localStorage` to store application data, including workout information and training history.

This means:

- Data persists across page reloads in the same browser and origin.
- Clearing the browser's stored application data may permanently remove workout history.
- Data is not automatically synchronized between devices.
- Exporting a JSON backup allows users to transfer their data to another device.
- Importing a backup can replace existing data, depending on the application's import behavior.

**Important:** Export your data regularly if you want to preserve your workout history.

## Dashboard and Progress Tracking

The dashboard provides an overview of training activity and exercise performance.

Depending on the available historical data, users can explore:

- Weekly and monthly workout counts.
- Personal records achieved during training.
- Exercise performance over time.
- Estimated one-repetition maximum (e1RM).
- Previous and latest best-set comparisons.
- Exercise history and recent performance.

Orbit uses the Epley formula to estimate one-repetition maximum:

`e1RM = weight × (1 + repetitions / 30)`

This is an estimate of strength, not a measurement of an actual one-repetition maximum.

Historical records are retained according to the application's existing data-retention rules.

## Privacy and Limitations

Orbit is designed around local storage rather than a remote user database.

- No remote database is required for local workout tracking.
- There is no automatic cloud synchronization.
- Data stored in one browser does not automatically appear in another browser or device.
- Browser storage can be lost if site data is cleared or the browser removes it.
- Exercise images and metadata must be available in the application for them to display correctly.

The actual privacy characteristics also depend on any external services or integrations present in the deployed application.

## Future Improvements

Potential areas for future development include:

- Cloud synchronization and user accounts.
- Cross-device workout history.
- More advanced exercise analytics.
- Additional workout planning and customization tools.
- Improved data portability and backup options.

## Contributing

Contributions and suggestions are welcome. If you find a bug or have an idea for improvement, open an issue or submit a pull request.

When contributing, keep changes focused, preserve existing functionality, and use descriptive Git commit messages.

---

**Orbit** — Track your workouts. Understand your progress.