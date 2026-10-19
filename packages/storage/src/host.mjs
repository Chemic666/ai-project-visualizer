import { openProductionStore } from "./index.mjs";
// No process, database, user-project root or Agent connection is created here.
export function openHost() {
  return openProductionStore();
}
