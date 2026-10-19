import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import { openSyntheticStore } from "../src/development.mjs";
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const require = createRequire(path.join(spec.driverRoot, "package.json"));
const core = await import(pathToFileURL(spec.corePath).href);
try {
  const cap = admitSyntheticRoot({
    enabled: true,
    root: spec.root,
    reopen: true,
    expectedNonce: spec.nonce,
  });
  const store = openSyntheticStore(cap, {
    Database: require(spec.driverRoot),
    applyNormalizedEvent: core.applyNormalizedEvent,
    processorFingerprint: spec.processorFingerprint,
    projectId: "PA",
    generation: "G1",
  });
  store.close();
  console.error("unexpected_owner_acquired");
  process.exitCode = 1;
} catch (error) {
  if (error?.code !== "ownership_busy") {
    console.error("competitor_failed");
    process.exitCode = 1;
  } else
    fs.writeFileSync(
      path.join(spec.evidence, "competitor.result.json"),
      JSON.stringify({
        pid: process.pid,
        parentPid: process.ppid,
        nonce: spec.nonce,
        status: "ownership_busy",
        businessWrites: 0,
      }),
      { flag: "wx" },
    );
}
