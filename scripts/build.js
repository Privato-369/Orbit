import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "app.js", "app.css", "workout.json"]) {
  await cp(resolve(root, file), resolve(output, file));
}

await cp(resolve(root, "workout-images"), resolve(output, "workout-images"), { recursive: true, force: true });

console.log(`Static site created in ${output}`);
