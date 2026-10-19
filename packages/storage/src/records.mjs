import {
  collections,
  digest,
  encode,
  validateState,
  validateCursor,
  sourceClaim,
  plain,
  closed,
  id,
} from "./codec.mjs";
import { demand, StorageError } from "./errors.mjs";

export const APPLICATION_ID = 0x41505631;
export const tables = [
  "store_meta",
  "commits",
  "normalized_events",
  "entity_versions",
  "assertions",
  "correction_versions",
  "conclusion_versions",
  "snapshots",
  "source_checkpoint_versions",
];
export const schema = `
CREATE TABLE store_meta(id INTEGER PRIMARY KEY CHECK(id=1),project_id TEXT NOT NULL,generation TEXT NOT NULL,processor TEXT NOT NULL,head INTEGER NOT NULL,state_digest TEXT NOT NULL,writer_epoch INTEGER NOT NULL,owner_token TEXT,control_nonce TEXT NOT NULL,lifecycle TEXT NOT NULL CHECK(lifecycle='active')) STRICT;
CREATE TABLE commits(seq INTEGER PRIMARY KEY,operation_id TEXT NOT NULL UNIQUE,nonce TEXT NOT NULL UNIQUE,project_id TEXT NOT NULL,generation TEXT NOT NULL,epoch INTEGER NOT NULL,intent_json TEXT NOT NULL,intent_digest TEXT NOT NULL,result_json TEXT NOT NULL,result_digest TEXT NOT NULL,state_digest TEXT NOT NULL) STRICT;
CREATE TABLE normalized_events(event_id TEXT PRIMARY KEY,seq INTEGER NOT NULL REFERENCES commits(seq),ordinal INTEGER NOT NULL,source_id TEXT NOT NULL,source_event_id TEXT,body TEXT NOT NULL,body_digest TEXT NOT NULL,claim_digest TEXT NOT NULL,UNIQUE(source_id,source_event_id),UNIQUE(seq,ordinal)) STRICT;
CREATE TABLE entity_versions(kind TEXT NOT NULL CHECK(kind IN ('projects','phases','tasks','sessions')),id TEXT NOT NULL,seq INTEGER NOT NULL REFERENCES commits(seq),ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_digest TEXT NOT NULL,PRIMARY KEY(kind,id,seq),UNIQUE(kind,seq,ordinal)) STRICT;
CREATE TABLE assertions(id TEXT PRIMARY KEY,seq INTEGER NOT NULL REFERENCES commits(seq),ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_digest TEXT NOT NULL) STRICT;
CREATE TABLE correction_versions(id TEXT NOT NULL,seq INTEGER NOT NULL REFERENCES commits(seq),ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_digest TEXT NOT NULL,PRIMARY KEY(id,seq),UNIQUE(seq,ordinal)) STRICT;
CREATE TABLE conclusion_versions(id TEXT NOT NULL,seq INTEGER NOT NULL REFERENCES commits(seq),ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_digest TEXT NOT NULL,PRIMARY KEY(id,seq),UNIQUE(seq,ordinal)) STRICT;
CREATE TABLE snapshots(watermark INTEGER PRIMARY KEY REFERENCES commits(seq),body TEXT NOT NULL,body_digest TEXT NOT NULL) STRICT;
CREATE TABLE source_checkpoint_versions(source_id TEXT NOT NULL,stream_id TEXT NOT NULL,seq INTEGER NOT NULL REFERENCES commits(seq),body TEXT NOT NULL,body_digest TEXT NOT NULL,PRIMARY KEY(source_id,stream_id,seq)) STRICT;
`;
export function checkedBody(row) {
  demand(row && typeof row.body === "string", "unavailable");
  const body = JSON.parse(row.body);
  demand(
    digest(body) === row.body_digest && encode(body) === row.body,
    "unavailable",
  );
  return body;
}
export function vectorAt(db, head) {
  const map = new Map();
  for (const row of db
    .prepare(
      "SELECT * FROM source_checkpoint_versions WHERE seq<=? ORDER BY source_id,stream_id,seq",
    )
    .all(head)) {
    const cursor = checkedBody(row);
    validateCursor(cursor);
    demand(
      cursor.sourceId === row.source_id && cursor.streamId === row.stream_id,
      "unavailable",
    );
    const key = encode([cursor.sourceId, cursor.streamId]);
    const prior = map.get(key);
    demand(
      cursor.expectedPrevious === (prior?.position ?? null),
      "unavailable",
    );
    map.set(key, cursor);
  }
  return [...map.values()];
}
export function stateAt(db, head) {
  const state = Object.fromEntries(collections.map((k) => [k, []]));
  for (const kind of ["projects", "phases", "tasks", "sessions"])
    state[kind] = db
      .prepare(
        "SELECT * FROM entity_versions WHERE kind=? AND seq=? ORDER BY ordinal",
      )
      .all(kind, head)
      .map((r) => {
        const body = checkedBody(r);
        demand(body.id === r.id, "unavailable");
        return body;
      });
  state.assertions = db
    .prepare("SELECT * FROM assertions WHERE seq<=? ORDER BY seq,ordinal")
    .all(head)
    .map((r) => {
      const body = checkedBody(r);
      demand(body.id === r.id, "unavailable");
      return body;
    });
  state.corrections = db
    .prepare("SELECT * FROM correction_versions WHERE seq=? ORDER BY ordinal")
    .all(head)
    .map((r) => {
      const body = checkedBody(r);
      demand(body.id === r.id, "unavailable");
      return body;
    });
  state.resolvedConclusions = db
    .prepare("SELECT * FROM conclusion_versions WHERE seq=? ORDER BY ordinal")
    .all(head)
    .map((r) => {
      const body = checkedBody(r);
      demand(encode([body.target, body.targetId]) === r.id, "unavailable");
      return body;
    });
  state.acceptedEvents = db
    .prepare(
      "SELECT * FROM normalized_events WHERE seq<=? ORDER BY seq,ordinal",
    )
    .all(head)
    .map((r) => {
      const body = checkedBody(r);
      const external =
        body.sourceIdentity?.kind === "source_event"
          ? body.sourceIdentity.sourceEventId
          : null;
      demand(
        body.id === r.event_id &&
          body.sourceId === r.source_id &&
          external === r.source_event_id &&
          sourceClaim(body) === r.claim_digest,
        "unavailable",
      );
      return body;
    });
  return state;
}
export function cacheBody(state, cursor, head, scope) {
  const { acceptedEvents: _events, ...domain } = state;
  return {
    domain,
    sourceVector: cursor,
    watermark: head,
    generation: scope.generation,
    processor: scope.processorFingerprint,
  };
}
export function restore(db, scope) {
  try {
    demand(
      db.pragma("application_id", { simple: true }) === APPLICATION_ID &&
        db.pragma("user_version", { simple: true }) === 1,
      "unavailable",
    );
    const actual = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => r.name);
    demand(encode(actual) === encode([...tables].sort()), "unavailable");
    demand(
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_schema WHERE type IN ('trigger','view')",
        )
        .get().n === 0,
      "unavailable",
    );
    demand(
      db.pragma("integrity_check").every((r) => r.integrity_check === "ok") &&
        db.pragma("foreign_key_check").length === 0,
      "unavailable",
    );
    const metaRows = db.prepare("SELECT * FROM store_meta").all();
    demand(metaRows.length === 1, "unavailable");
    const meta = metaRows[0];
    demand(
      meta.project_id === scope.projectId &&
        meta.generation === scope.generation &&
        meta.processor === scope.processorFingerprint &&
        meta.lifecycle === "active" &&
        Number.isSafeInteger(meta.writer_epoch) &&
        meta.writer_epoch >= 0,
      "unavailable",
    );
    const commits = db.prepare("SELECT * FROM commits ORDER BY seq").all();
    demand(commits.length > 0 && commits.length === meta.head, "unavailable");
    let current;
    for (const [i, row] of commits.entries()) {
      demand(
        row.seq === i + 1 &&
          row.project_id === scope.projectId &&
          row.generation === scope.generation &&
          Number.isSafeInteger(row.epoch) &&
          row.epoch >= 0 &&
          row.epoch <= meta.writer_epoch,
        "unavailable",
      );
      const intent = JSON.parse(row.intent_json),
        result = JSON.parse(row.result_json);
      plain(intent);
      plain(result);
      const common = [
        "operationId",
        "operationNonce",
        "projectId",
        "generation",
        "expectedHead",
      ];
      closed(intent, [
        ...common,
        ...(i === 0
          ? ["seedDigest"]
          : ["eventClaims", "cursor", "createSnapshot"]),
      ]);
      closed(result, [
        "head",
        "stateDigest",
        "canonicalEventIds",
        "cursorVectorDigest",
      ]);
      for (const key of [
        "operationId",
        "operationNonce",
        "projectId",
        "generation",
      ])
        id(intent[key]);
      for (const hash of [result.stateDigest, result.cursorVectorDigest])
        demand(
          typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash),
          "unavailable",
        );
      demand(Array.isArray(result.canonicalEventIds), "unavailable");
      result.canonicalEventIds.forEach((v) => id(v));
      demand(
        encode(intent) === row.intent_json &&
          encode(result) === row.result_json,
        "unavailable",
      );
      demand(
        digest(intent) === row.intent_digest &&
          digest(result) === row.result_digest &&
          result.head === row.seq &&
          intent.operationId === row.operation_id &&
          intent.operationNonce === row.nonce &&
          intent.projectId === scope.projectId &&
          intent.generation === scope.generation,
        "unavailable",
      );
      demand(intent.expectedHead === row.seq - 1, "unavailable");
      const state = stateAt(db, row.seq);
      validateState(state, scope.projectId, {
        allowedLocations: [scope.observedRoot],
      });
      const cursor = vectorAt(db, row.seq);
      for (const c of cursor)
        for (const id of c.coveredEventIds)
          demand(
            state.acceptedEvents.some(
              (e) => e.id === id && e.sourceId === c.sourceId,
            ),
            "unavailable",
          );
      const stateDigest = digest(state);
      demand(
        stateDigest === row.state_digest &&
          result.stateDigest === stateDigest &&
          result.cursorVectorDigest === digest(cursor),
        "unavailable",
      );
      if (i === 0) {
        demand(
          intent.operationId === "bootstrap" &&
            intent.seedDigest === stateDigest &&
            row.epoch === 0 &&
            encode(result.canonicalEventIds) ===
              encode(state.acceptedEvents.map((e) => e.id)),
          "unavailable",
        );
      } else {
        demand(
          Array.isArray(intent.eventClaims) &&
            intent.eventClaims.length > 0 &&
            intent.eventClaims.length === result.canonicalEventIds.length &&
            typeof intent.createSnapshot === "boolean",
          "unavailable",
        );
        if (intent.cursor !== null) {
          validateCursor(intent.cursor);
          const persisted = db
            .prepare("SELECT * FROM source_checkpoint_versions WHERE seq=?")
            .all(row.seq);
          demand(
            persisted.length === 1 &&
              encode(checkedBody(persisted[0])) === encode(intent.cursor),
            "unavailable",
          );
        } else
          demand(
            db
              .prepare(
                "SELECT count(*) AS n FROM source_checkpoint_versions WHERE seq=?",
              )
              .get(row.seq).n === 0,
            "unavailable",
          );
        intent.eventClaims.forEach((claim, index) => {
          closed(claim, ["internalId", "claim"]);
          const event = state.acceptedEvents.find(
            (e) => e.id === result.canonicalEventIds[index],
          );
          demand(event, "unavailable");
          demand(
            claim.claim === sourceClaim(event) &&
              claim.internalId ===
                (event.sourceIdentity?.kind === "source_event"
                  ? null
                  : event.id),
            "unavailable",
          );
        });
      }
      current = { state, cursor, head: row.seq, stateDigest };
    }
    demand(current.stateDigest === meta.state_digest, "unavailable");
    for (const snapshot of db
      .prepare("SELECT * FROM snapshots ORDER BY watermark")
      .all()) {
      demand(
        snapshot.watermark >= 1 && snapshot.watermark <= meta.head,
        "unavailable",
      );
      const body = checkedBody(snapshot),
        expected = cacheBody(
          stateAt(db, snapshot.watermark),
          vectorAt(db, snapshot.watermark),
          snapshot.watermark,
          scope,
        );
      demand(encode(body) === encode(expected), "unavailable");
    }
    demand(
      db.prepare("SELECT count(*) AS n FROM snapshots").get().n <= 2,
      "unavailable",
    );
    return current;
  } catch {
    throw new StorageError("unavailable");
  }
}
export function logicalBytes(db) {
  return tables
    .filter((t) => !["snapshots", "store_meta"].includes(t))
    .reduce(
      (n, t) =>
        n + Buffer.byteLength(encode(db.prepare(`SELECT * FROM ${t}`).all())),
      0,
    );
}
export function writeState(db, state, seq) {
  const addEntity = db.prepare(
    "INSERT INTO entity_versions VALUES(?,?,?,?,?,?)",
  );
  for (const kind of ["projects", "phases", "tasks", "sessions"])
    state[kind].forEach((body, ordinal) =>
      addEntity.run(kind, body.id, seq, ordinal, encode(body), digest(body)),
    );
  const addAssertion = db.prepare("INSERT INTO assertions VALUES(?,?,?,?,?)");
  state.assertions.forEach((body, ordinal) => {
    const existing = db
      .prepare("SELECT * FROM assertions WHERE id=?")
      .get(body.id);
    if (existing) demand(existing.body === encode(body), "identity_conflict");
    else addAssertion.run(body.id, seq, ordinal, encode(body), digest(body));
  });
  for (const [kind, table] of [
    ["corrections", "correction_versions"],
    ["resolvedConclusions", "conclusion_versions"],
  ]) {
    const add = db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?)`);
    state[kind].forEach((body, ordinal) =>
      add.run(
        kind === "corrections" ? body.id : encode([body.target, body.targetId]),
        seq,
        ordinal,
        encode(body),
        digest(body),
      ),
    );
  }
  const addEvent = db.prepare(
    "INSERT INTO normalized_events VALUES(?,?,?,?,?,?,?,?)",
  );
  state.acceptedEvents.forEach((body, ordinal) => {
    const existing = db
      .prepare("SELECT * FROM normalized_events WHERE event_id=?")
      .get(body.id);
    if (existing) demand(existing.body === encode(body), "identity_conflict");
    else
      addEvent.run(
        body.id,
        seq,
        ordinal,
        body.sourceId,
        body.sourceIdentity?.kind === "source_event"
          ? body.sourceIdentity.sourceEventId
          : null,
        encode(body),
        digest(body),
        sourceClaim(body),
      );
  });
}
export function addReceipt(
  db,
  { state, cursor, head, intent, epoch, canonicalEventIds },
) {
  const result = {
    head,
    stateDigest: digest(state),
    canonicalEventIds,
    cursorVectorDigest: digest(cursor),
  };
  const receipt = {
    operationId: intent.operationId,
    operationNonce: intent.operationNonce,
    projectId: intent.projectId,
    generation: intent.generation,
    epoch,
    intentDigest: digest(intent),
    resultDigest: digest(result),
    stateDigest: result.stateDigest,
    head,
  };
  db.prepare("INSERT INTO commits VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
    head,
    intent.operationId,
    intent.operationNonce,
    intent.projectId,
    intent.generation,
    BigInt(epoch),
    encode(intent),
    receipt.intentDigest,
    encode(result),
    receipt.resultDigest,
    receipt.stateDigest,
  );
  return receipt;
}
