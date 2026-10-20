const STORAGE_KEY = "orbit.data.v1";
const KG_TO_LB = 2.2046226218;
const MAX_HISTORY = 30;
const app = document.querySelector("#app");
let catalogue = [];
let catalogueError = "";
let errorMessage = "";

const icons = {
  dashboard: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="8" height="7" rx="2"/></svg>',
  workouts: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 5v14M18 5v14M3 9v6m18-6v6M6 12h12"/></svg>',
  settings: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1 1.9-1.7 2.9-2.2-.5a7.7 7.7 0 0 1-1.7 1l-.7 2.1h-3.4l-.7-2.1a7.7 7.7 0 0 1-1.7-1l-2.2.5-1.7-2.9 1.1-1.9a8 8 0 0 1 0-2l-1.1-1.9 1.7-2.9 2.2.5a7.7 7.7 0 0 1 1.7-1l.7-2.1h3.4l.7 2.1a7.7 7.7 0 0 1 1.7 1l2.2-.5 1.7 2.9-1.1 1.9a8 8 0 0 1 0 2Z" transform="translate(0 -1) scale(.92) translate(1 1)"/></svg>',
  orbit: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="10.5" ry="4.5" transform="rotate(-32 12 12)"/><circle cx="18.9" cy="6.8" r="1.4" fill="currentColor" stroke="none"/></svg>',
};

const blankData = () => ({
  version: 1,
  profile: null,
  templates: [],
  sessions: [],
  histories: {},
  latest: {},
  prs: [],
  active: null,
});

let data = loadData();
let page = data.profile ? "Dashboard" : "Onboarding";
let onboardingStep = 0;
let editor = null;
let modal = null;
let toastTimer = null;
let selectedExercise = null;
let selectedPeriod = "Past 7 Days";
let selectedMetric = "e1rm";
let exercisePickerOpen = false;
let pendingImport = null;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankData();
    const parsed = JSON.parse(raw);
    return validateBackup({ format: "orbit-backup", schemaVersion: 1, data: parsed });
  } catch (error) {
    console.error("Could not read valid Orbit data:", error);
    errorMessage = "Saved Orbit data is malformed or incomplete. A fresh session is open; export a backup if you have another copy.";
    return blankData();
  }
}

function persist(next, successMessage = "") {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    data = next;
    errorMessage = "";
    if (successMessage) notify(successMessage);
    render();
    return true;
  } catch (error) {
    console.error("Could not save Orbit data:", error);
    errorMessage = "Orbit could not save this change. Your current screen is still open; export a backup or free browser storage and try again.";
    render();
    return false;
  }
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function fmtDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, options);
}

function unit() {
  return data.profile?.unit || "kg";
}

function toDisplay(kg, digits = 1) {
  if (!Number.isFinite(Number(kg))) return "—";
  const value = unit() === "lb" ? Number(kg) * KG_TO_LB : Number(kg);
  return Number(value.toFixed(digits)).toString();
}

function fromDisplay(value) {
  const number = Number(value);
  return unit() === "lb" ? number / KG_TO_LB : number;
}

function notify(message) {
  clearTimeout(toastTimer);
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), 3200);
}

function navButton(name) {
  const icon = name === "My Workouts" ? icons.workouts : icons[name.toLowerCase()];
  return `<button class="nav-link ${page === name ? "active" : ""}" data-action="navigate" data-page="${name}">${icon}<span>${name}</span></button>`;
}

function shell(content) {
  const nav = ["Dashboard", "My Workouts", "Settings"];
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${icons.orbit}</span><span>orbit</span></div>
      <nav class="nav-list" aria-label="Main navigation">${nav.map(navButton).join("")}</nav>
      <div class="sidebar-bottom"><strong>Private by design</strong>Your workouts stay in this browser. Export a backup from Settings.</div>
    </aside>
    <main class="main"><div class="content">${errorMessage ? `<div class="alert error" role="alert">${esc(errorMessage)}</div>` : ""}${catalogueError ? `<div class="alert error" role="alert">${esc(catalogueError)} <button class="inline-link" data-action="retry-catalogue">Try again</button></div>` : ""}${content}</div></main>
    <nav class="mobile-nav" aria-label="Main navigation">${nav.map(navButton).join("")}</nav>
    ${renderModal()}
  </div>`;
}

function render() {
  if (!data.profile) {
    app.innerHTML = renderOnboarding();
    return;
  }
  if (data.active && page === "Active Workout") {
    app.innerHTML = shell(renderActiveSession());
    focusModal();
    return;
  }
  let content;
  if (page === "My Workouts") content = editor ? renderEditor() : renderWorkouts();
  else if (page === "Settings") content = renderSettings();
  else if (page === "Exercise History") content = renderHistoryPage();
  else content = renderDashboard();
  app.innerHTML = shell(content);
  focusModal();
}

function focusModal() {
  if (modal) requestAnimationFrame(() => app.querySelector(".modal button")?.focus());
}

function renderOnboarding() {
  if (onboardingStep === 0) {
    const items = [
      ["Free essential tracking", "Log exercises, sets, reps and weight without a subscription."],
      ["Your data stays yours", "Workout information stays in this browser instead of a remote account."],
      ["Useful progress insights", "See exercise history, personal records and training frequency."],
      ["Portable backups", "Export your Orbit data as JSON and restore it on another device."],
    ];
    return `<main class="onboarding"><section class="onboard-card">
      <div class="brand onboard-brand"><span class="brand-mark">${icons.orbit}</span><span>orbit</span></div>
      <div class="eyebrow">A calmer way to track training</div><h1>Make progress, one session at a time.</h1>
      <p class="subheading">A straightforward workout tracker that keeps your training history in your hands.</p>
      <div class="benefit-grid">${items.map(([title, desc]) => `<article class="benefit"><h3>${title}</h3><p>${desc}</p></article>`).join("")}</div>
      <button class="button primary" data-action="onboarding-next">Continue <span aria-hidden="true">→</span></button>
      <div class="onboard-progress">1 of 2 · About Orbit</div>
    </section></main>`;
  }
  return `<main class="onboarding"><section class="onboard-card">
    <div class="brand onboard-brand"><span class="brand-mark">${icons.orbit}</span><span>orbit</span></div>
    <div class="eyebrow">Your training space</div><h1>What should we call you?</h1>
    <p class="subheading">Your name is saved only in this browser and used for a personal greeting.</p>
    <form id="onboarding-form" style="max-width:380px;margin-top:26px">
      <label class="field-label" for="username">Display name</label>
      <input class="text-input" id="username" name="username" maxlength="60" autocomplete="name" placeholder="e.g. Alex" required />
      <p id="name-error" class="row-secondary" aria-live="polite"></p>
      <button class="button primary" type="submit" style="margin-top:11px">Go to dashboard <span aria-hidden="true">→</span></button>
    </form>
    <button class="inline-link" data-action="onboarding-back" style="margin-top:22px">← Back</button>
    <div class="onboard-progress">2 of 2 · Your profile</div>
  </section></main>`;
}

function getStats() {
  const now = new Date();
  const startWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (startWeek.getDay() + 6) % 7;
  startWeek.setDate(startWeek.getDate() - day);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const finished = data.sessions.filter(s => s.status === "completed" && !Number.isNaN(new Date(s.completedAt).getTime()));
  const tracked = Object.keys(data.histories).filter(id => (data.histories[id] || []).length > 0).length;
  return {
    week: finished.filter(s => new Date(s.completedAt) >= startWeek).length,
    month: finished.filter(s => new Date(s.completedAt) >= startMonth).length,
    prs: data.prs.filter(p => !Number.isNaN(new Date(p.achievedAt).getTime()) && new Date(p.achievedAt) >= startMonth).length,
    tracked,
  };
}

function historyFor(id) {
  return [...(data.histories[id] || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function performanceStatus(records) {
  if (records.length < 6) return "Insufficient Data";
  const recent = records.slice(-3).map(record => record.e1rmKg);
  const earlier = records.slice(-6, -3).map(record => record.e1rmKg);
  if (earlier.length < 3) return "Insufficient Data";
  const recentAverage = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const earlierAverage = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;
  if (recentAverage > earlierAverage * 1.02) return "Improving";
  if (recentAverage >= earlierAverage * 0.98) return "Maintaining";
  return "No Recent PR";
}

function exerciseLabel(id) {
  return catalogue.find(ex => ex.id === id)?.name ||
    Object.values(data.latest).find(x => x.exerciseId === id)?.name ||
    historyFor(id).at(-1)?.exerciseName || "Exercise";
}

function renderExerciseIdentity(id, name, size = "small") {
  const exerciseId = typeof id === "string" ? id : "";
  const imageUrl = exerciseId
    ? new URL(`workout-images/${encodeURIComponent(exerciseId)}.jpg`, document.baseURI).href
    : "";
  const label = name || exerciseLabel(exerciseId);
  return `<span class="exercise-identity"><span class="exercise-thumb exercise-thumb-${size}" aria-hidden="true">
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="" loading="lazy" decoding="async" data-exercise-image="${esc(exerciseId)}" />` : ""}
    <span class="exercise-thumb-fallback" ${imageUrl ? "hidden" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3"/><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6"/></svg></span>
  </span><span class="exercise-identity-name">${esc(label)}</span></span>`;
}

function renderDashboard() {
  const stats = getStats();
  const trackedIds = Object.keys(data.histories).filter(id => data.histories[id]?.length);
  if (!selectedExercise || !trackedIds.includes(selectedExercise)) selectedExercise = trackedIds[0] || "";
  const records = selectedExercise ? historyFor(selectedExercise) : [];
  const cutoff = new Date();
  const periodEnd = new Date(cutoff);
  if (selectedPeriod === "Past 7 Days") cutoff.setDate(cutoff.getDate() - 7);
  if (selectedPeriod === "Past 15 Days") cutoff.setDate(cutoff.getDate() - 15);
  const visible = selectedPeriod === "All Time" ? records : records.filter(r => {
    const timestamp = new Date(r.timestamp);
    return timestamp >= cutoff && timestamp <= periodEnd;
  });
  const points = visible.map(r => ({ ...r, value: selectedMetric === "reps" ? r.reps : selectedMetric === "weight" ? fromDisplay(r.weightKg) : fromDisplay(r.e1rmKg) }));
  const svg = renderChart(points);
  const pct = points.length > 1 && points[0].value > 0 ? ((points.at(-1).value - points[0].value) / points[0].value) * 100 : null;
  const recentPrs = [...data.prs].sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt)).slice(0, 5);
  const latestByExercise = trackedIds.map(id => ({ id, record: historyFor(id).at(-1), count: historyFor(id).length })).sort((a, b) => new Date(b.record?.timestamp || 0) - new Date(a.record?.timestamp || 0)).slice(0, 6);
  const statusRows = trackedIds.map(id => ({ id, status: performanceStatus(historyFor(id)) }))
    .sort((a, b) => a.status.localeCompare(b.status)).slice(0, 6);
  const activeBanner = data.active ? `<div class="alert info">You have an unfinished workout: <strong>${esc(data.active.workoutName)}</strong> <button class="inline-link" data-action="resume-session">Resume workout</button></div>` : "";

  return `${activeBanner}
    <header class="page-header"><div><div class="eyebrow">Your training, at a glance</div><h1>Welcome back, ${esc(data.profile.name)}.</h1><p class="subheading">A clear view of your work and what’s building over time.</p></div><button class="button primary" data-action="${data.templates.length ? "navigate" : "create-workout"}" ${data.templates.length ? 'data-page="My Workouts"' : ""}>＋ Start a workout</button></header>
    <section class="stats-grid" aria-label="Workout summary">
      ${statCard("Workouts this week", stats.week, "Monday–Sunday")}
      ${statCard("Workouts this month", stats.month, "Completed sessions")}
      ${statCard("New PRs this month", stats.prs, "Recorded this month")}
      ${statCard("Exercises tracked", stats.tracked, "With retained history")}
    </section>
    <section class="dashboard-grid">
      <article class="card card-pad chart-card">
        <div class="section-title"><div><h2>Exercise progress</h2><div class="row-secondary">Estimated strength is an e1RM estimate, not a direct measurement.</div></div></div>
        ${trackedIds.length ? `<div class="chart-top">
          <div class="exercise-picker">
            <button class="exercise-picker-trigger" type="button" data-action="toggle-exercise-picker" aria-haspopup="listbox" aria-expanded="${exercisePickerOpen}">${renderExerciseIdentity(selectedExercise, exerciseLabel(selectedExercise), "small")}<span class="picker-chevron" aria-hidden="true">⌄</span></button>
            ${exercisePickerOpen ? `<div class="exercise-picker-options" role="listbox" aria-label="Choose exercise">${trackedIds.map(id => `<button type="button" class="exercise-picker-option ${id === selectedExercise ? "selected" : ""}" role="option" aria-selected="${id === selectedExercise}" data-action="select-chart-exercise" data-id="${esc(id)}">${renderExerciseIdentity(id, exerciseLabel(id), "small")}</button>`).join("")}</div>` : ""}
          </div>
          <label class="sr-only" for="chart-period">Time period</label><select id="chart-period" class="select compact">${["Past 7 Days", "Past 15 Days", "All Time"].map(p => `<option ${p === selectedPeriod ? "selected" : ""}>${p}</option>`).join("")}</select>
          <label class="sr-only" for="chart-metric">Chart metric</label><select id="chart-metric" class="select compact"><option value="e1rm" ${selectedMetric === "e1rm" ? "selected" : ""}>Estimated strength</option><option value="weight" ${selectedMetric === "weight" ? "selected" : ""}>Weight</option><option value="reps" ${selectedMetric === "reps" ? "selected" : ""}>Repetitions</option></select>
        </div>
        <div class="chart-wrap">${svg}</div>
        ${points.length ? `<div class="chart-summary"><div><div class="tiny-label">Latest best set</div><div class="chart-metric">${toDisplay(points.at(-1).weightKg)} ${unit()} × ${points.at(-1).reps}</div></div><div class="chart-change">${pct === null ? "Not enough records to compare" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs earliest visible record`}</div></div>
        <div class="chart-foot"><span>${esc(fmtDate(points[0].timestamp))}</span><button class="inline-link" data-action="open-history" data-id="${esc(selectedExercise)}">View retained history →</button></div>` : `<div class="empty"><strong>No sessions in this period</strong>Choose a wider time range or finish another workout.</div>`}
        ` : `<div class="empty"><strong>Your progress will appear here</strong>Complete a workout to start building real exercise history.<button class="button" data-action="navigate" data-page="My Workouts">View my workouts</button></div>`}
      </article>
      <div class="stack">
        <article class="card card-pad"><div class="section-title"><h2>Recent personal records</h2><span class="badge">Retained history</span></div>
          ${recentPrs.length ? `<div class="list">${recentPrs.map(pr => `<div class="list-row"><div><button class="inline-link row-primary exercise-link" data-action="open-history" data-id="${esc(pr.exerciseId)}">${renderExerciseIdentity(pr.exerciseId, pr.exerciseName || exerciseLabel(pr.exerciseId), "tiny")}</button><div class="row-secondary">${esc(pr.label)} · ${fmtDate(pr.achievedAt)}</div></div><div class="row-value">${pr.weightKg != null ? `${toDisplay(pr.weightKg)} ${unit()}${pr.reps ? ` × ${pr.reps}` : ""}` : `${Number(pr.value).toFixed(1)} e1RM`}</div></div>`).join("")}</div>` : `<div class="empty"><strong>No personal records yet</strong>Records are detected when you save a workout.</div>`}
        </article>
        <article class="card card-pad"><div class="section-title"><h2>Recent exercise history</h2><span class="badge">${trackedIds.length} exercises</span></div>
          ${latestByExercise.length ? `<div class="list">${latestByExercise.map(({ id, record, count }) => `<div class="list-row"><div><button class="inline-link row-primary exercise-link" data-action="open-history" data-id="${esc(id)}">${renderExerciseIdentity(id, exerciseLabel(id), "tiny")}</button><div class="row-secondary">${fmtDate(record.timestamp)} · ${count} retained ${count === 1 ? "session" : "sessions"}</div></div><div class="row-value">${toDisplay(record.weightKg)} ${unit()} × ${record.reps}</div></div>`).join("")}</div>` : `<div class="empty"><strong>No recent activity</strong>Your exercise history will show up after your first saved workout.</div>`}
        </article>
        <article class="card card-pad"><div class="section-title"><h2>Performance status</h2><span class="badge">Retained history</span></div>
          ${statusRows.length ? `<div class="list">${statusRows.map(({ id, status }) => `<div class="list-row"><button class="inline-link row-primary exercise-link" data-action="open-history" data-id="${esc(id)}">${renderExerciseIdentity(id, exerciseLabel(id), "tiny")}</button><span class="badge ${status === "Improving" ? "good" : ""}">${status}</span></div>`).join("")}</div>` : `<div class="empty"><strong>Not enough training data yet</strong>Status appears after several sessions for an exercise.</div>`}
        </article>
      </div>
    </section>`;
}

function statCard(label, value, note) {
  return `<article class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
}

function renderChart(points, metric = selectedMetric) {
  if (!points.length) return `<svg role="img" aria-label="No chart data" viewBox="0 0 500 190"></svg>`;
  const w = 500, h = 190, padX = 38, padY = 20;
  const values = points.map(p => p.value);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = maxV - minV || Math.max(1, maxV * .12);
  const lo = minV - range * .18, hi = maxV + range * .18;
  const coords = points.map((p, i) => ({
    x: points.length === 1 ? w / 2 : padX + (i / (points.length - 1)) * (w - padX * 2),
    y: h - padY - ((p.value - lo) / (hi - lo)) * (h - padY * 2),
    p,
  }));
  const grid = [0, 1, 2, 3].map(i => {
    const y = padY + (i / 3) * (h - padY * 2);
    return `<line x1="${padX}" x2="${w - padX}" y1="${y}" y2="${y}" stroke="#edeee9" stroke-width="1"/>`;
  }).join("");
  const line = coords.map(c => `${c.x},${c.y}`).join(" ");
  const circles = coords.map((c, i) => `<circle cx="${c.x}" cy="${c.y}" r="${points.length === 1 ? 5 : 3.6}" fill="#d66d2f"><title>${esc(fmtDate(c.p.timestamp))}: ${metric === "reps" ? c.p.reps + " reps" : `${toDisplay(metric === "weight" ? c.p.weightKg : c.p.e1rmKg)} ${unit()}`}; ${toDisplay(c.p.weightKg)} ${unit()} × ${c.p.reps}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Exercise performance over time">${grid}<polyline points="${line}" fill="none" stroke="#d66d2f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${circles}<text x="${padX}" y="${h}" fill="#858980" font-size="10">${esc(fmtDate(points[0].timestamp, { month: "short", day: "numeric" }))}</text><text x="${w - padX}" y="${h}" text-anchor="end" fill="#858980" font-size="10">${esc(fmtDate(points.at(-1).timestamp, { month: "short", day: "numeric" }))}</text></svg>`;
}

function renderWorkouts() {
  const sorted = [...data.templates].sort((a, b) => a.order - b.order);
  return `<header class="page-header"><div><div class="eyebrow">Build your own routine</div><h1>My Workouts</h1><p class="subheading">Your routines, in the order that works for you.</p></div><button class="button primary" data-action="create-workout">＋ Create new workout</button></header>
    ${catalogueError && !catalogue.length ? `<div class="empty card"><strong>Exercise catalogue unavailable</strong>Workout editing needs workout.json. Check the file and retry.</div>` : ""}
    ${sorted.length ? `<section class="workout-grid">${sorted.map((workout, index) => {
      const totalSets = workout.exercises.reduce((sum, x) => sum + x.sets, 0);
      return `<article class="card workout-card"><div class="workout-card-top"><div><div class="workout-title">${esc(workout.name)}</div><div class="workout-meta">${workout.exercises.length} ${workout.exercises.length === 1 ? "exercise" : "exercises"} · ${totalSets} sets</div></div><span class="badge">Routine ${index + 1}</span></div>
        <div class="exercise-pills">${workout.exercises.slice(0, 4).map(item => `<span class="exercise-chip">${renderExerciseIdentity(item.exerciseId, catalogue.find(e => e.id === item.exerciseId)?.name || item.name || "Exercise", "tiny")}</span>`).join("")}${workout.exercises.length > 4 ? `<span class="pill">+${workout.exercises.length - 4} more</span>` : ""}</div>
        <div class="workout-actions"><button class="button primary small" data-action="start-workout" data-id="${esc(workout.id)}">Start workout</button><div class="actions-right">
          <button class="icon-button" aria-label="Move ${esc(workout.name)} up" title="Move up" data-action="move-workout" data-id="${esc(workout.id)}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-button" aria-label="Move ${esc(workout.name)} down" title="Move down" data-action="move-workout" data-id="${esc(workout.id)}" data-direction="1" ${index === sorted.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-button" aria-label="Edit ${esc(workout.name)}" title="Edit" data-action="edit-workout" data-id="${esc(workout.id)}">✎</button>
          <button class="icon-button" aria-label="Delete ${esc(workout.name)}" title="Delete" data-action="confirm-delete-workout" data-id="${esc(workout.id)}">×</button>
        </div></div></article>`;
    }).join("")}</section>` : `<section class="card empty"><strong>No workouts yet</strong>Create a routine from exercises in your catalogue. You choose the exercises, order and set counts.<br/><button class="button primary" data-action="create-workout">Create your first workout</button></section>`}`;
}

function renderEditor() {
  const categories = [...new Set(catalogue.map(e => e.category))].sort((a, b) => a.localeCompare(b));
  const query = editor.query || "";
  const category = editor.category || "";
  const selected = new Set(editor.exercises.map(x => x.exerciseId));
  const matches = catalogue.filter(e => {
    const text = `${e.name} ${e.category} ${e.primaryMuscle} ${e.secondaryMuscles.join(" ")}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!category || e.category === category);
  });
  return `<header class="page-header"><div><div class="eyebrow">Workout builder</div><h1>${editor.id ? "Edit workout" : "Create a workout"}</h1><p class="subheading">Choose a name, add exercises and set your working set targets.</p></div><button class="button" data-action="cancel-editor">← Back to workouts</button></header>
    <form id="workout-form">
      <div class="card editor-card" style="margin-bottom:15px"><label class="field-label" for="workout-name">Workout name</label><input id="workout-name" class="text-input" name="name" maxlength="70" placeholder="e.g. Upper body" value="${esc(editor.name)}" required /></div>
      <div class="editor-layout">
        <section class="card editor-card"><div class="section-title"><div><h2>Exercise library</h2><div class="row-secondary">${catalogue.length} exercises · choose from your catalogue</div></div></div>
          ${catalogueError ? `<div class="alert error">${esc(catalogueError)}</div>` : ""}
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(145px,.55fr);gap:8px">
            <label class="sr-only" for="exercise-search">Search exercises</label><input id="exercise-search" class="text-input" value="${esc(query)}" placeholder="Search exercises or muscles…" />
            <label class="sr-only" for="category-filter">Filter by category</label><select id="category-filter" class="select"><option value="">All categories</option>${categories.map(c => `<option value="${esc(c)}" ${category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
          </div>
          <div class="exercise-results">${matches.length ? matches.map(ex => `<div class="exercise-result"><div class="exercise-result-info">${renderExerciseIdentity(ex.id, ex.name, "medium")}<div class="exercise-meta">${esc(ex.category)} · ${esc(ex.primaryMuscle)}${ex.secondaryMuscles.length ? ` · ${esc(ex.secondaryMuscles.join(", "))}` : ""}</div></div><button type="button" class="button small ${selected.has(ex.id) ? "" : "primary"}" data-action="${selected.has(ex.id) ? "remove-exercise" : "add-exercise"}" data-id="${esc(ex.id)}">${selected.has(ex.id) ? "Added ✓" : "Add"}</button></div>`).join("") : `<div class="empty"><strong>No matching exercises</strong>Try another search or clear the category filter.<br/><button class="button small" type="button" data-action="clear-exercise-filters">Clear filters</button></div>`}</div>
        </section>
        <section class="card editor-card selected-panel"><div class="section-title"><div><h2>Your exercises</h2><div class="row-secondary">${editor.exercises.length} selected · set targets are adjustable</div></div></div>
          ${editor.exercises.length ? editor.exercises.map((item, index) => {
            const ex = catalogue.find(e => e.id === item.exerciseId);
            return `<div class="selected-item"><div class="selected-exercise-info">${renderExerciseIdentity(item.exerciseId, ex?.name || item.name || "Exercise", "small")}<div class="tiny-label">${esc(ex?.category || item.category || "")}</div></div><label><span class="tiny-label">Sets</span><input class="number-input set-count" aria-label="Sets for ${esc(ex?.name || "exercise")}" type="number" min="1" max="30" step="1" value="${item.sets}" data-action="set-count" data-index="${index}" /></label><div style="display:flex;gap:4px"><button type="button" class="icon-button" aria-label="Move up" data-action="move-exercise" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="icon-button" aria-label="Move down" data-action="move-exercise" data-index="${index}" data-direction="1" ${index === editor.exercises.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="icon-button" aria-label="Remove exercise" data-action="remove-exercise" data-id="${esc(item.exerciseId)}">×</button></div></div>`;
          }).join("") : `<div class="empty"><strong>No exercises selected</strong>Search the library and add the exercises for this routine.</div>`}
        </section>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:17px"><button type="button" class="button" data-action="cancel-editor">Cancel</button><button class="button primary" type="submit">Save workout</button></div>
    </form>`;
}

function renderActiveSession() {
  const active = data.active;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000));
  const elapsed = `${Math.floor(seconds / 60)} min`;
  return `<header class="page-header"><div><div class="eyebrow">Workout in progress · started ${fmtDate(active.startedAt, { hour: "numeric", minute: "2-digit" })}</div><h1>${esc(active.workoutName)}</h1><p class="session-timer">Elapsed ${elapsed} · session autosaves in this browser</p></div><button class="button danger" data-action="cancel-session">Cancel workout</button></header>
    ${active.exercises.map((exercise, ei) => `<section class="card session-exercise">
      <div class="session-heading"><div><h2 class="session-exercise-title">${renderExerciseIdentity(exercise.exerciseId, exercise.name, "large")}</h2><div class="row-secondary">${esc(exercise.category || "")} · Previous performance from latest completed session</div></div><button class="inline-link" data-action="open-history" data-id="${esc(exercise.exerciseId)}">History</button></div>
      <div style="overflow-x:auto"><table class="set-table"><thead><tr><th>Set</th><th>Previous</th><th>Weight (${unit()})</th><th>Reps</th><th>Done</th></tr></thead><tbody>
        ${exercise.sets.map((set, si) => {
          const hasPreviousPositions = exercise.previous?.some(item => Number.isInteger(item.setNumber));
          const prev = hasPreviousPositions
            ? exercise.previous.find(item => item.setNumber === si + 1)
            : exercise.previous?.[si];
          return `<tr class="set-row ${set.done ? "done" : ""}"><td>${si + 1}</td><td>${prev ? `${toDisplay(prev.weightKg)} × ${prev.reps}` : "—"}</td>
            <td><input class="number-input" type="number" inputmode="decimal" min="0" step="0.25" aria-label="${esc(exercise.name)} set ${si + 1} weight in ${unit()}" value="${esc(set.weight)}" placeholder="—" data-session-input="weight" data-exercise="${ei}" data-set="${si}" /></td>
            <td><input class="number-input" type="number" inputmode="numeric" min="0" step="1" aria-label="${esc(exercise.name)} set ${si + 1} repetitions" value="${esc(set.reps)}" placeholder="—" data-session-input="reps" data-exercise="${ei}" data-set="${si}" /></td>
            <td><input class="done-control" type="checkbox" aria-label="Mark ${esc(exercise.name)} set ${si + 1} done" ${set.done ? "checked" : ""} data-action="toggle-set" data-exercise="${ei}" data-set="${si}" /></td></tr>`;
        }).join("")}
      </tbody></table></div>
      ${!exercise.previous?.length ? `<div class="row-secondary" style="margin-top:9px">No previous data for this exercise.</div>` : ""}
    </section>`).join("")}
    <div class="session-footer"><span class="subheading">Only checked, valid sets are saved. Unchecked sets are excluded.</span><button class="button primary" data-action="finish-session">Save and end workout</button></div>`;
}

function renderSettings() {
  return `<header class="page-header"><div><div class="eyebrow">Your account on this device</div><h1>Settings</h1><p class="subheading">Manage your profile, units and portable data backups.</p></div></header>
    <div class="settings-grid">
      <section class="card setting-card"><div class="setting-row"><div class="setting-copy"><h2>Profile</h2><p>Your display name appears in your welcome message. It is stored only in this browser.</p></div><div class="setting-control"><label class="field-label" for="profile-name">Display name</label><input id="profile-name" class="text-input" maxlength="60" value="${esc(data.profile.name)}" /></div></div><button class="button small" style="margin-top:13px" data-action="save-profile">Save name</button></section>
      <section class="card setting-card"><div class="setting-row"><div class="setting-copy"><h2>Weight unit</h2><p>Performance is stored in kilograms internally. Switching units converts values for display without rewriting your history.</p></div><div class="setting-control"><label class="field-label" for="weight-unit">Preferred unit</label><select class="select" id="weight-unit"><option value="kg" ${unit() === "kg" ? "selected" : ""}>Kilograms (kg)</option><option value="lb" ${unit() === "lb" ? "selected" : ""}>Pounds (lb)</option></select></div></div></section>
      <section class="card setting-card"><div class="setting-row"><div class="setting-copy"><h2>Export your data</h2><p>Download a JSON backup with your profile, workout templates, sessions, retained exercise history and personal records.</p></div><button class="button" data-action="export-data">Export my data</button></div></section>
      <section class="card setting-card"><div class="setting-row"><div class="setting-copy"><h2>Import a backup</h2><p>Restore a valid Orbit JSON backup. Your current Orbit data will be replaced only after you confirm.</p></div><div class="setting-control"><input id="import-file" type="file" accept="application/json,.json" hidden /><button class="button" data-action="choose-import">Choose JSON file</button></div></div></section>
      <section class="card setting-card danger-zone"><div class="setting-row"><div class="setting-copy"><h2>Delete all my data</h2><p>Delete Orbit data stored in this browser. Templates and history cannot be recovered without a backup.</p></div><button class="button danger" data-action="confirm-delete-all">Delete all data</button></div></section>
      <div class="row-secondary" style="padding:0 3px">Orbit runs locally in your browser. Your data is not synced or automatically backed up.</div>
    </div>`;
}

function renderHistoryPage() {
  const id = selectedExercise;
  const chronological = historyFor(id);
  const records = [...chronological].reverse();
  const ex = catalogue.find(x => x.id === id);
  const first = records[0];
  const bestWeight = records.length ? Math.max(...records.map(x => x.weightKg)) : null;
  const mostReps = records.length ? records.reduce((best, record) => record.reps > best.reps ? record : best) : null;
  const bestE1rm = records.length ? Math.max(...records.map(x => x.e1rmKg)) : null;
  return `<header class="page-header"><div><div class="eyebrow">Retained exercise history</div><h1 class="history-exercise-title">${renderExerciseIdentity(id, exerciseLabel(id), "large")}</h1><p class="subheading">${esc(ex?.category || first?.category || "Exercise")} · ${esc(ex?.primaryMuscle || first?.primaryMuscle || "")}${ex?.secondaryMuscles?.length ? ` · ${esc(ex.secondaryMuscles.join(", "))}` : ""}</p></div><button class="button" data-action="back-dashboard">← Dashboard</button></header>
    ${records.length ? `<section class="stats-grid">${statCard("Latest", `${toDisplay(first.weightKg)} ${unit()} × ${first.reps}`, fmtDate(first.timestamp))}${statCard("Highest retained weight", `${toDisplay(bestWeight)} ${unit()}`, "Across retained best sets")}${statCard("Most reps at a weight", `${mostReps.reps} reps`, `At ${toDisplay(mostReps.weightKg)} ${unit()}`)}${statCard("Highest estimated e1RM", `${toDisplay(bestE1rm)} ${unit()}`, "Estimate, not a direct measurement")}</section>
      <section class="card card-pad" style="margin-bottom:15px"><div class="section-title"><div><h2>Estimated strength over time</h2><div class="row-secondary">Each point is a session best-set e1RM estimate.</div></div></div><div class="chart-wrap">${renderChart(chronological.map(record => ({ ...record, value: fromDisplay(record.e1rmKg) })), "e1rm")}</div></section>
      <section class="card card-pad"><div class="section-title"><div><h2>Performance history</h2><div class="row-secondary">Up to ${MAX_HISTORY} most recent recorded sessions are retained per exercise.</div></div><span class="badge">${records.length} records</span></div><div class="history-list list">${records.map(r => `<div class="list-row"><div><div class="row-primary">${fmtDate(r.timestamp)}</div><div class="row-secondary">${esc(r.workoutName)}</div></div><div class="row-value">${toDisplay(r.weightKg)} ${unit()} × ${r.reps}<div class="row-secondary">e1RM ${toDisplay(r.e1rmKg)} ${unit()}</div></div></div>`).join("")}</div></section>`
      : `<section class="card empty"><strong>No retained history yet</strong>Finish a workout with this exercise to start recording performance.</section>`}`;
}

function renderModal() {
  if (!modal) return "";
  let title = "Confirm action", body = "", confirm = "Continue", danger = false;
  if (modal.type === "delete-workout") {
    title = "Delete workout template?";
    body = "This removes the saved routine only. Completed workout history will not be deleted.";
    confirm = "Delete workout"; danger = true;
  } else if (modal.type === "discard-editor") {
    title = "Discard workout changes?";
    body = "Your unsaved workout edits will be lost. Choose Keep data to continue editing.";
    confirm = "Discard changes"; danger = true;
  } else if (modal.type === "cancel-session") {
    title = "Cancel this workout?";
    body = "Your unfinished session and its unsaved inputs will be discarded. This cannot be undone.";
    confirm = "Cancel workout"; danger = true;
  } else if (modal.type === "finish-empty") {
    title = "Finish without completed sets?";
    body = "No checked sets will be recorded. The empty session metadata will still count as a completed workout.";
    confirm = "Save empty session";
  } else if (modal.type === "import") {
    title = "Replace Orbit data?";
    body = `Importing ${esc(modal.filename)} replaces the current Orbit dataset. Any data not included in this backup will be lost. Export your current data first if you want to keep a copy.`;
    confirm = "Replace and import"; danger = true;
  } else if (modal.type === "delete-all") {
    title = "Delete all Orbit data?";
    body = "All Orbit data stored in this browser will be deleted, including workout templates, active sessions and history. Orbit cannot recover deleted data without a backup. Export a JSON backup first if you may need it.";
    confirm = "Continue"; danger = true;
  } else if (modal.type === "delete-all-final") {
    title = "Final confirmation";
    body = "This permanently removes Orbit data from this browser. Are you sure you want to delete everything?";
    confirm = "Delete all my data"; danger = true;
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h2 id="modal-title">${title}</h2><p>${body}</p><div class="modal-actions"><button class="button" data-action="close-modal">Keep data</button><button class="button ${danger ? "danger" : "primary"}" data-action="modal-confirm">${confirm}</button></div>
  </section></div>`;
}

async function loadCatalogue() {
  catalogueError = "";
  try {
    const response = await fetch(new URL("workout.json", document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!json || !Array.isArray(json.workouts) || json.workouts.some(e =>
      !e || typeof e.id !== "string" || !e.id || typeof e.name !== "string" ||
      typeof e.category !== "string" || typeof e.primaryMuscle !== "string" ||
      !Array.isArray(e.secondaryMuscles) || e.secondaryMuscles.some(m => typeof m !== "string"))) {
      throw new Error("Catalogue data has an invalid structure.");
    }
    const ids = json.workouts.map(e => e.id);
    if (new Set(ids).size !== ids.length) throw new Error("Catalogue exercise IDs must be unique.");
    catalogue = json.workouts;
  } catch (error) {
    catalogueError = `Could not load the exercise catalogue (${error.message}). Check workout.json and retry.`;
    console.error("Could not load workout.json:", error);
  }
  render();
}

function createEditor(template = null) {
  editor = template ? {
    id: template.id,
    name: template.name,
    exercises: template.exercises.map(x => ({ ...x })),
    query: "",
    category: "",
    createdAt: template.createdAt,
  } : { id: null, name: "", exercises: [], query: "", category: "", createdAt: new Date().toISOString() };
  page = "My Workouts";
  render();
}

function editorHasChanges() {
  if (!editor) return false;
  const original = editor.id ? data.templates.find(template => template.id === editor.id) : null;
  if (!original) return Boolean(editor.name.trim() || editor.exercises.length);
  return editor.name !== original.name || editor.exercises.length !== original.exercises.length ||
    editor.exercises.some((exercise, index) =>
      exercise.exerciseId !== original.exercises[index]?.exerciseId ||
      exercise.sets !== original.exercises[index]?.sets);
}

function makeActiveSession(template) {
  const active = {
    id: uid(),
    workoutId: template.id,
    workoutName: template.name,
    startedAt: new Date().toISOString(),
    exercises: template.exercises.map(item => {
      const ex = catalogue.find(e => e.id === item.exerciseId);
      const previous = data.latest[item.exerciseId];
      return {
        exerciseId: item.exerciseId,
        name: ex?.name || item.name || "Exercise",
        category: ex?.category || item.category || "",
        primaryMuscle: ex?.primaryMuscle || item.primaryMuscle || "",
        sets: Array.from({ length: item.sets }, () => ({ weight: "", reps: "", done: false })),
        previous: previous?.sets || [],
      };
    }),
  };
  const next = { ...data, active };
  if (persist(next)) {
    page = "Active Workout";
    render();
  }
}

function sessionSet(exerciseIndex, setIndex) {
  return data.active?.exercises?.[exerciseIndex]?.sets?.[setIndex];
}

function finishSession() {
  const active = data.active;
  if (!active) return;
  const completedExercises = [];
  for (const exercise of active.exercises) {
    const sets = [];
    for (let index = 0; index < exercise.sets.length; index += 1) {
      const set = exercise.sets[index];
      if (!set.done) continue;
      const weight = set.weight.trim();
      const reps = set.reps.trim();
      if (!weight || !reps || !Number.isFinite(Number(weight)) || Number(weight) < 0 ||
        !/^\d+$/.test(reps) || Number(reps) < 1) {
        notify("Complete checked sets need a valid weight and at least 1 repetition.");
        return;
      }
      sets.push({ weightKg: fromDisplay(weight), reps: Number(reps), setNumber: index + 1 });
    }
    if (sets.length) completedExercises.push({
      exerciseId: exercise.exerciseId, exerciseName: exercise.name, category: exercise.category,
      primaryMuscle: exercise.primaryMuscle, sets,
    });
  }
  if (!completedExercises.length) {
    modal = { type: "finish-empty" };
    render();
    return;
  }
  saveCompletedSession(active, completedExercises);
}

function saveCompletedSession(active, completedExercises) {
  if (data.sessions.some(s => s.id === active.id)) return;
  const completedAt = new Date().toISOString();
  const session = {
    id: active.id, workoutId: active.workoutId, workoutName: active.workoutName,
    startedAt: active.startedAt, completedAt, status: "completed", exercises: completedExercises,
  };
  const next = { ...data, sessions: [...data.sessions, session], histories: { ...data.histories }, latest: { ...data.latest }, prs: [...data.prs], active: null };
  for (const exercise of completedExercises) {
    const best = exercise.sets.map((set, index) => ({ ...set, setNumber: set.setNumber || index + 1, e1rmKg: set.weightKg * (1 + set.reps / 30) }))
      .sort((a, b) => b.e1rmKg - a.e1rmKg || b.weightKg - a.weightKg)[0];
    const currentHistory = [...(next.histories[exercise.exerciseId] || [])];
    const priorSessions = data.sessions.filter(s => s.status === "completed").flatMap(s => (s.exercises || []).filter(e => e.exerciseId === exercise.exerciseId));
    const priorWeights = priorSessions.flatMap(e => e.sets.map(s => s.weightKg));
    const priorRepMax = new Map();
    priorSessions.flatMap(e => e.sets).forEach(set => {
      const key = Math.round(set.weightKg * 100) / 100;
      priorRepMax.set(key, Math.max(priorRepMax.get(key) || 0, set.reps));
    });
    const heaviest = Math.max(...priorWeights, -1);
    const priorBestE1rm = Math.max(...currentHistory.map(r => r.e1rmKg), -1);
    const makePr = (type, label, values) => next.prs.push({
      id: uid(), exerciseId: exercise.exerciseId, exerciseName: exercise.exerciseName,
      sessionId: session.id, type, label, achievedAt: completedAt, ...values,
    });
    const heaviestSet = [...exercise.sets].sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0];
    if (heaviestSet.weightKg > heaviest + 0.005) {
      makePr("heaviest", "New heaviest set", { weightKg: heaviestSet.weightKg, reps: heaviestSet.reps, value: heaviestSet.weightKg });
    }
    const repsByWeight = new Map();
    exercise.sets.forEach(set => {
      const key = Math.round(set.weightKg * 100) / 100;
      repsByWeight.set(key, Math.max(repsByWeight.get(key) || 0, set.reps));
    });
    repsByWeight.forEach((reps, key) => {
      if (reps > (priorRepMax.get(key) || 0)) {
        makePr("reps", `New rep PR at ${toDisplay(key)} ${unit()}`, { weightKg: key, reps, value: reps });
      }
    });
    if (best.e1rmKg > priorBestE1rm + 0.0001) {
      makePr("e1rm", "New estimated strength PR", { weightKg: best.weightKg, reps: best.reps, value: best.e1rmKg });
    }
    currentHistory.push({
      exerciseId: exercise.exerciseId, exerciseName: exercise.exerciseName, sessionId: session.id,
      workoutName: session.workoutName, timestamp: completedAt, weightKg: best.weightKg, reps: best.reps, e1rmKg: best.e1rmKg,
    });
    currentHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    next.histories[exercise.exerciseId] = currentHistory.slice(-MAX_HISTORY);
    next.latest[exercise.exerciseId] = {
      exerciseId: exercise.exerciseId, name: exercise.exerciseName, category: exercise.category,
      primaryMuscle: exercise.primaryMuscle, sessionId: session.id, timestamp: completedAt,
      sets: exercise.sets.map(s => ({ weightKg: s.weightKg, reps: s.reps, setNumber: s.setNumber })),
    };
  }
  modal = null;
  if (persist(next, "Workout saved. Your history and records have been updated.")) {
    page = "Dashboard";
    render();
  }
}

function validateBackup(backup) {
  if (!backup || backup.format !== "orbit-backup" || backup.schemaVersion !== 1 || !backup.data || typeof backup.data !== "object") {
    throw new Error("This is not a supported Orbit backup.");
  }
  const d = backup.data;
  if (d.version !== 1 || !d.profile || typeof d.profile.name !== "string" || !d.profile.name.trim() ||
    !["kg", "lb"].includes(d.profile.unit) || !Array.isArray(d.templates) || !Array.isArray(d.sessions) ||
    !d.histories || typeof d.histories !== "object" || !d.latest || typeof d.latest !== "object" ||
    !Array.isArray(d.prs) || !(d.active === null || typeof d.active === "object")) throw new Error("The backup data is incomplete or has invalid types.");
  const templateIds = new Set();
  const templateOrders = new Set();
  for (const t of d.templates) {
    if (!t || typeof t.id !== "string" || templateIds.has(t.id) || typeof t.name !== "string" ||
      !t.name.trim() || !Array.isArray(t.exercises) || !Number.isInteger(t.order) || t.order < 0 ||
      templateOrders.has(t.order) || !Number.isFinite(new Date(t.createdAt).getTime()) ||
      !Number.isFinite(new Date(t.updatedAt).getTime())) throw new Error("The backup contains an invalid workout template.");
    templateIds.add(t.id);
    templateOrders.add(t.order);
    const exerciseIds = new Set();
    for (const e of t.exercises) {
      if (!e || typeof e.exerciseId !== "string" || exerciseIds.has(e.exerciseId) ||
        !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 30 ||
        (catalogue.length && !catalogue.some(entry => entry.id === e.exerciseId))) {
        throw new Error("The backup contains an invalid exercise reference or set count.");
      }
      exerciseIds.add(e.exerciseId);
    }
  }
  const sessionIds = new Set();
  for (const s of d.sessions) {
    if (!s || typeof s.id !== "string" || sessionIds.has(s.id) || typeof s.workoutName !== "string" ||
      !Number.isFinite(new Date(s.startedAt).getTime()) || !Number.isFinite(new Date(s.completedAt).getTime()) ||
      s.status !== "completed" || !Array.isArray(s.exercises)) throw new Error("The backup contains an invalid completed session.");
    sessionIds.add(s.id);
    for (const e of s.exercises) {
      if (!e || typeof e.exerciseId !== "string" || typeof e.exerciseName !== "string" || !Array.isArray(e.sets) ||
        e.sets.some(set => !set || !Number.isFinite(set.weightKg) || set.weightKg < 0 ||
          !Number.isInteger(set.reps) || set.reps < 1 ||
          (set.setNumber !== undefined && (!Number.isInteger(set.setNumber) || set.setNumber < 1)))) throw new Error("The backup contains invalid set data.");
    }
  }
  for (const [id, records] of Object.entries(d.histories)) {
    if (typeof id !== "string" || !Array.isArray(records) || records.length > MAX_HISTORY ||
      records.some(r => !r || r.exerciseId !== id || !sessionIds.has(r.sessionId) || !Number.isFinite(r.weightKg) || r.weightKg < 0 ||
        !Number.isInteger(r.reps) || r.reps < 1 || !Number.isFinite(r.e1rmKg) ||
        !Number.isFinite(new Date(r.timestamp).getTime()))) throw new Error("The backup contains invalid exercise history.");
  }
  const prIds = new Set();
  for (const pr of d.prs) {
    if (!pr || typeof pr.id !== "string" || prIds.has(pr.id) || typeof pr.exerciseId !== "string" ||
      !sessionIds.has(pr.sessionId) || typeof pr.label !== "string" ||
      !Number.isFinite(new Date(pr.achievedAt).getTime())) throw new Error("The backup contains invalid personal record events.");
    prIds.add(pr.id);
  }
  for (const [id, latest] of Object.entries(d.latest)) {
    if (!id || !latest || latest.exerciseId !== id || typeof latest.name !== "string" ||
      !sessionIds.has(latest.sessionId) || !Number.isFinite(new Date(latest.timestamp).getTime()) || !Array.isArray(latest.sets) ||
      latest.sets.some(set => !set || !Number.isFinite(set.weightKg) || set.weightKg < 0 ||
        !Number.isInteger(set.reps) || set.reps < 1 ||
        (set.setNumber !== undefined && (!Number.isInteger(set.setNumber) || set.setNumber < 1)))) {
      throw new Error("The backup contains invalid previous-performance data.");
    }
  }
  if (d.active && (!d.active.id || sessionIds.has(d.active.id) || typeof d.active.workoutName !== "string" ||
    !Array.isArray(d.active.exercises) || !Number.isFinite(new Date(d.active.startedAt).getTime()) ||
    d.active.exercises.some(exercise => !exercise || typeof exercise.exerciseId !== "string" ||
      !Array.isArray(exercise.sets) || exercise.sets.some(set => !set || typeof set.weight !== "string" ||
        typeof set.reps !== "string" || typeof set.done !== "boolean") ||
      (exercise.previous !== undefined && (!Array.isArray(exercise.previous) || exercise.previous.some(set =>
        !Number.isFinite(set.weightKg) || set.weightKg < 0 || !Number.isInteger(set.reps) || set.reps < 1)))))) {
    throw new Error("The backup contains an invalid active workout.");
  }
  return d;
}

function exportData() {
  const backup = { format: "orbit-backup", schemaVersion: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify("Your Orbit backup is ready.");
}

app.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  const closedExercisePicker = exercisePickerOpen && !event.target.closest(".exercise-picker");
  if (closedExercisePicker) exercisePickerOpen = false;
  if (!button) {
    if (event.target.classList.contains("modal-backdrop")) {
      modal = null;
      render();
    } else if (closedExercisePicker && !event.target.closest("select, input, textarea")) render();
    return;
  }
  const action = button.dataset.action;
  if (action === "toggle-exercise-picker") {
    exercisePickerOpen = !exercisePickerOpen;
    render();
  } else if (action === "select-chart-exercise") {
    selectedExercise = button.dataset.id;
    exercisePickerOpen = false;
    render();
  } else if (action === "navigate") {
    const target = button.dataset.page;
    if (editor && target !== "My Workouts" && editorHasChanges()) {
      modal = { type: "discard-editor", target };
      render();
      return;
    }
    editor = null;
    page = target;
    render();
  } else if (action === "onboarding-next") {
    onboardingStep = 1;
    render();
    document.querySelector("#username")?.focus();
  } else if (action === "onboarding-back") {
    onboardingStep = 0;
    render();
  } else if (action === "create-workout") createEditor();
  else if (action === "edit-workout") createEditor(data.templates.find(t => t.id === button.dataset.id));
  else if (action === "cancel-editor") {
    if (editorHasChanges()) {
      modal = { type: "discard-editor", target: "My Workouts" };
      render();
    } else {
      editor = null; page = "My Workouts"; render();
    }
  }
  else if (action === "add-exercise") {
    const ex = catalogue.find(e => e.id === button.dataset.id);
    if (ex && !editor.exercises.some(e => e.exerciseId === ex.id)) {
      editor.exercises.push({ exerciseId: ex.id, sets: 3, name: ex.name, category: ex.category, primaryMuscle: ex.primaryMuscle });
      render();
    }
  } else if (action === "remove-exercise") {
    if (editor) { editor.exercises = editor.exercises.filter(e => e.exerciseId !== button.dataset.id); render(); }
  } else if (action === "move-exercise") {
    const i = Number(button.dataset.index), j = i + Number(button.dataset.direction);
    if (editor && j >= 0 && j < editor.exercises.length) {
      [editor.exercises[i], editor.exercises[j]] = [editor.exercises[j], editor.exercises[i]];
      render();
    }
  } else if (action === "clear-exercise-filters") {
    editor.query = ""; editor.category = ""; render();
  } else if (action === "move-workout") {
    const list = [...data.templates].sort((a, b) => a.order - b.order);
    const i = list.findIndex(w => w.id === button.dataset.id), j = i + Number(button.dataset.direction);
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      persist({ ...data, templates: list.map((w, order) => ({ ...w, order })) });
    }
  } else if (action === "confirm-delete-workout") { modal = { type: "delete-workout", id: button.dataset.id }; render(); }
  else if (action === "start-workout") {
    const template = data.templates.find(w => w.id === button.dataset.id);
    if (!template) return;
    if (data.active) { page = "Active Workout"; render(); notify("Resume or cancel your current workout before starting another."); }
    else makeActiveSession(template);
  } else if (action === "resume-session") { page = "Active Workout"; render(); }
  else if (action === "cancel-session") { modal = { type: "cancel-session" }; render(); }
  else if (action === "finish-session") finishSession();
  else if (action === "toggle-set") {
    const set = sessionSet(Number(button.dataset.exercise), Number(button.dataset.set));
    if (!set) return;
    set.done = button.checked;
    persist({ ...data, active: { ...data.active } });
  } else if (action === "open-history") {
    selectedExercise = button.dataset.id;
    page = "Exercise History";
    render();
  } else if (action === "back-dashboard") { page = "Dashboard"; render(); }
  else if (action === "save-profile") {
    const name = document.querySelector("#profile-name").value.trim();
    if (!name) { notify("Please enter a display name."); return; }
    persist({ ...data, profile: { ...data.profile, name } }, "Profile updated.");
  } else if (action === "export-data") exportData();
  else if (action === "choose-import") document.querySelector("#import-file").click();
  else if (action === "confirm-delete-all") { modal = { type: "delete-all" }; render(); }
  else if (action === "close-modal") { modal = null; render(); }
  else if (action === "modal-confirm") {
    const current = modal;
    if (current?.type === "delete-workout") {
      const next = { ...data, templates: data.templates.filter(w => w.id !== current.id) };
      modal = null; persist(next, "Workout template deleted.");
    } else if (current?.type === "discard-editor") {
      modal = null; editor = null; page = current.target; render();
    } else if (current?.type === "cancel-session") {
      modal = null;
      if (persist({ ...data, active: null }, "Unfinished workout cancelled.")) { page = "Dashboard"; render(); }
    } else if (current?.type === "finish-empty") {
      modal = null;
      saveCompletedSession(data.active, []);
    } else if (current?.type === "import" && pendingImport) {
      modal = null;
      if (persist(pendingImport, "Backup imported successfully.")) {
        pendingImport = null; editor = null; page = "Dashboard"; render();
      }
    } else if (current?.type === "delete-all") {
      modal = { type: "delete-all-final" }; render();
    } else if (current?.type === "delete-all-final") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        data = blankData(); page = "Onboarding"; onboardingStep = 0; modal = null; errorMessage = "";
        render(); notify("Orbit data deleted.");
      } catch (error) {
        console.error("Could not delete Orbit data:", error);
        modal = null; errorMessage = "Orbit could not remove its saved data from this browser.";
        render();
      }
    }
  } else if (action === "retry-catalogue") loadCatalogue();
});

app.addEventListener("input", event => {
  const target = event.target;
  if (target.id === "workout-name" && editor) {
    editor.name = target.value;
  } else if (target.id === "exercise-search" && editor) {
    editor.query = target.value;
    const pos = target.selectionStart;
    render();
    const input = document.querySelector("#exercise-search");
    input?.focus();
    input?.setSelectionRange(pos, pos);
  } else if (target.matches("[data-action='set-count']") && editor) {
    const value = Number(target.value);
    if (Number.isInteger(value) && value > 0 && value <= 30) editor.exercises[Number(target.dataset.index)].sets = value;
  } else if (target.matches("[data-session-input]")) {
    const set = sessionSet(Number(target.dataset.exercise), Number(target.dataset.set));
    if (!set) return;
    set[target.dataset.sessionInput] = target.value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      errorMessage = "";
    } catch (error) {
      console.error("Could not autosave active workout:", error);
      errorMessage = "This workout could not be autosaved. Keep this page open and export your data after saving.";
    }
  }
});

app.addEventListener("change", event => {
  const target = event.target;
  if (target.id === "category-filter" && editor) {
    editor.category = target.value;
    render();
  } else if (target.id === "chart-period") {
    selectedPeriod = target.value;
    exercisePickerOpen = false;
    render();
  } else if (target.id === "chart-metric") {
    selectedMetric = target.value;
    exercisePickerOpen = false;
    render();
  } else if (target.id === "weight-unit") {
    persist({ ...data, profile: { ...data.profile, unit: target.value } }, `Weight unit changed to ${target.value}.`);
  } else if (target.id === "import-file" && target.files?.[0]) {
    const file = target.files[0];
    file.text().then(text => {
      try {
        pendingImport = validateBackup(JSON.parse(text));
        modal = { type: "import", filename: file.name };
        render();
      } catch (error) {
        console.error("Invalid Orbit backup:", error);
        notify(`Import failed: ${error.message}`);
      } finally {
        target.value = "";
      }
    }).catch(error => {
      console.error("Could not read Orbit backup:", error);
      notify("The selected backup file could not be read.");
    });
  }
});

app.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches("[data-exercise-image]")) return;
  image.hidden = true;
  const fallback = image.nextElementSibling;
  if (fallback) fallback.hidden = false;
}, true);

app.addEventListener("submit", event => {
  if (event.target.id === "onboarding-form") {
    event.preventDefault();
    const name = new FormData(event.target).get("username").trim();
    const feedback = document.querySelector("#name-error");
    if (!name) { feedback.textContent = "Enter a name to continue."; return; }
    const next = { ...blankData(), profile: { name, unit: "kg" } };
    if (persist(next)) { page = "Dashboard"; render(); }
  } else if (event.target.id === "workout-form") {
    event.preventDefault();
    const name = new FormData(event.target).get("name").trim();
    if (!name) { notify("Enter a name for this workout."); return; }
    if (!editor.exercises.length) { notify("Add at least one exercise before saving."); return; }
    const duplicate = editor.exercises.some((e, i) => editor.exercises.findIndex(x => x.exerciseId === e.exerciseId) !== i);
    if (duplicate) { notify("An exercise can only appear once in a workout."); return; }
    const timestamp = new Date().toISOString();
    const template = {
      id: editor.id || uid(), name, exercises: editor.exercises.map(e => ({ exerciseId: e.exerciseId, sets: e.sets })),
      order: editor.id ? data.templates.find(t => t.id === editor.id)?.order ?? data.templates.length : data.templates.length,
      createdAt: editor.createdAt || timestamp, updatedAt: timestamp,
    };
    const templates = editor.id ? data.templates.map(t => t.id === template.id ? template : t) : [...data.templates, template];
    if (persist({ ...data, templates }, editor.id ? "Workout updated." : "Workout created.")) {
      editor = null; page = "My Workouts"; render();
    }
  }
});

app.addEventListener("keydown", event => {
  if (!modal) return;
  if (event.key === "Escape") {
    modal = null;
    render();
    return;
  }
  if (event.key !== "Tab") return;
  const buttons = [...app.querySelectorAll(".modal button")];
  if (!buttons.length) return;
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

loadCatalogue();
render();
