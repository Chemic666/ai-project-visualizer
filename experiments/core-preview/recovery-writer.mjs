import { writeFixture } from "./recovery.mjs";

try {
  if (process.argv.length !== 3)
    throw new Error("synthetic_preview_writer_args");
  const result = await writeFixture(process.argv[2]);
  process.stdout.write(JSON.stringify(result));
} catch {
  console.error("synthetic_preview_writer_unavailable");
  process.exitCode = 1;
}
