import type { CoreState, applyNormalizedEvent } from "../../core/src/index.js";
import { openProductionStore } from "../src/index.mjs";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import {
  openSyntheticStore,
  type SqliteConnection,
} from "../src/development.mjs";
declare const Database: new (filename: string) => SqliteConnection;
declare const apply: typeof applyNormalizedEvent;
declare const state: CoreState;
const disabled: false = false;
const result = openProductionStore({ enabled: true });
const reason: "physical_binding_unverified" = result.reason;
void reason;

openSyntheticStore(
  // @ts-expect-error callers cannot forge a development capability
  {},
  {
    Database,
    applyNormalizedEvent: apply,
    processorFingerprint: "",
    projectId: "PA",
    generation: "G1",
  },
);
// @ts-expect-error development requires explicit true
admitSyntheticRoot({ enabled: disabled, root: "" });
const cap = admitSyntheticRoot({ enabled: true, root: "" });
const store = openSyntheticStore(cap, {
  Database,
  applyNormalizedEvent: apply,
  processorFingerprint: "",
  projectId: "PA",
  generation: "G1",
  bootstrap: state,
});
const restored: CoreState = store.read().state;
void restored;
