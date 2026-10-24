import test from "node:test";
import assert from "node:assert/strict";
import { validateExerciseSet } from "./exercise-validation.js";

const exercise = {
  id: "00001",
  maxWeightPerRep: 150,
  maxVolumeLoad: 1800,
};

const validate = (weight, reps, metadata = exercise, inputUnit = "kg") =>
  validateExerciseSet({
    exerciseId: "00001",
    exerciseCatalog: metadata ? [metadata] : [],
    weight,
    reps,
    inputUnit,
  });

test("accepts valid sets and equality at both configured limits", () => {
  assert.equal(validate("15", "12").valid, true);
  assert.equal(validate("150", "12").valid, true);
  assert.equal(validate("100", "1", {
    id: "00001",
    maxWeightPerRep: 100,
    maxVolumeLoad: 1200,
  }).valid, true);
});

test("rejects weight, per-set volume, and high-repetition violations", () => {
  assert.equal(validate("151", "1").reason, "weight-limit");
  assert.equal(validate("100", "20").reason, "volume-limit");
  assert.equal(validate("15", "12000").reason, "volume-limit");
});

test("rejects malformed, negative, zero-rep, fractional-rep, and overflowing inputs", () => {
  for (const [weight, reps] of [
    ["", "1"],
    ["15", ""],
    ["not a number", "1"],
    ["15", "nope"],
    ["-1", "1"],
    ["15", "-1"],
    ["15", "0"],
    ["15", "1.5"],
    ["NaN", "1"],
    ["Infinity", "1"],
    ["1e309", "1"],
    ["1e308", "1e308"],
  ]) {
    assert.equal(validate(weight, reps).valid, false, `${weight} × ${reps} should fail`);
  }
});

test("accepts zero external weight when reps are positive", () => {
  assert.equal(validate("0", "12").valid, true);
});

test("rejects missing, mismatched, duplicated, or malformed exercise metadata", () => {
  assert.equal(validate("15", "12", null).reason, "invalid-metadata");
  assert.equal(validateExerciseSet({
    exerciseId: "missing",
    exerciseCatalog: [exercise],
    weight: "15",
    reps: "12",
    inputUnit: "kg",
  }).reason, "invalid-metadata");
  assert.equal(validate("15", "12", { ...exercise, maxVolumeLoad: "1800" }).reason, "invalid-metadata");
  assert.equal(validate("15", "12", { ...exercise, maxWeightPerRep: Infinity }).reason, "invalid-metadata");
  assert.equal(validate("15", "12", { ...exercise, maxWeightPerRep: 0 }).reason, "invalid-metadata");
  assert.equal(validateExerciseSet({
    exerciseId: "00001",
    exerciseCatalog: [exercise, exercise],
    weight: "15",
    reps: "12",
    inputUnit: "kg",
  }).reason, "invalid-metadata");
});

test("converts displayed pounds to canonical kilograms before comparing limits", () => {
  const result = validate("220.46226218", "1", exercise, "lb");
  assert.equal(result.valid, true);
  assert.ok(Math.abs(result.weightKg - 100) < 1e-9);
  assert.equal(validate("331", "1", exercise, "lb").reason, "weight-limit");
});
