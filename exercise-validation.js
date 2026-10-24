const KG_TO_LB = 2.2046226218;
const DECIMAL_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parseFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !DECIMAL_NUMBER.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateExerciseSet({ exerciseId, exerciseCatalog, weight, reps, inputUnit }) {
  const enteredWeight = parseFiniteNumber(weight);
  const enteredReps = parseFiniteNumber(reps);
  if (enteredWeight === null || enteredWeight < 0 ||
    enteredReps === null || !Number.isInteger(enteredReps) || enteredReps < 1) {
    return { valid: false, reason: "invalid-input" };
  }

  if (inputUnit !== "kg" && inputUnit !== "lb") {
    return { valid: false, reason: "invalid-metadata" };
  }

  if (typeof exerciseId !== "string" || !exerciseId || !Array.isArray(exerciseCatalog)) {
    return { valid: false, reason: "invalid-metadata" };
  }

  const matchingExercises = exerciseCatalog.filter(exercise =>
    exercise && typeof exercise.id === "string" && exercise.id === exerciseId);
  if (matchingExercises.length !== 1) {
    return { valid: false, reason: "invalid-metadata" };
  }

  const exercise = matchingExercises[0];
  if (typeof exercise.maxWeightPerRep !== "number" ||
    !Number.isFinite(exercise.maxWeightPerRep) || exercise.maxWeightPerRep <= 0 ||
    typeof exercise.maxVolumeLoad !== "number" ||
    !Number.isFinite(exercise.maxVolumeLoad) || exercise.maxVolumeLoad <= 0) {
    return { valid: false, reason: "invalid-metadata" };
  }

  const weightKg = inputUnit === "lb" ? enteredWeight / KG_TO_LB : enteredWeight;
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    return { valid: false, reason: "invalid-input" };
  }

  if (weightKg > exercise.maxWeightPerRep) {
    return {
      valid: false,
      reason: "weight-limit",
      weightKg,
      limitKg: exercise.maxWeightPerRep,
    };
  }

  const volumeLoad = weightKg * enteredReps;
  if (!Number.isFinite(volumeLoad) || volumeLoad > exercise.maxVolumeLoad) {
    return {
      valid: false,
      reason: "volume-limit",
      weightKg,
      reps: enteredReps,
      volumeLoad,
      limit: exercise.maxVolumeLoad,
    };
  }

  return {
    valid: true,
    weightKg,
    reps: enteredReps,
    volumeLoad,
  };
}
