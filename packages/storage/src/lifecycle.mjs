import { demand } from "./errors.mjs";
export class WriterLifecycle {
  #phase = "ADMITTED";
  #events = [{ seq: 1, phase: "ADMITTED" }];
  phase() {
    return this.#phase;
  }
  history() {
    return structuredClone(this.#events);
  }
  advance(next) {
    const edges = {
      ADMITTED: ["OWNER_HELD_UNFENCED", "REVOKING"],
      OWNER_HELD_UNFENCED: ["RECOVERED", "REVOKING"],
      RECOVERED: ["FENCED", "REVOKING"],
      FENCED: ["ACTIVE", "REVOKING"],
      ACTIVE: ["REVOKING"],
      REVOKING: ["DRAINED"],
      DRAINED: ["CLOSED"],
      CLOSED: [],
    };
    demand(edges[this.#phase].includes(next), "unavailable");
    this.#phase = next;
    this.#events.push({ seq: this.#events.length + 1, phase: next });
  }
  assertActive() {
    demand(this.#phase === "ACTIVE", "unavailable");
  }
}
