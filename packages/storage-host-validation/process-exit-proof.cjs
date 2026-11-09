const fs = require("node:fs"),
  { spawnSync } = require("node:child_process"),
  { createHash } = require("node:crypto");
function classifyRecordedExit({ inUse, createdMs, recordMs }) {
  if (inUse === false) return "absent";
  if (
    inUse === true &&
    Number.isFinite(createdMs) &&
    createdMs > 0 &&
    Number.isFinite(recordMs) &&
    recordMs > 0 &&
    createdMs > recordMs
  )
    return "pid_reused";
  throw Error("recorded_process_not_exited");
}
function probe(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw Error("process_exit_unverified");
  }
}
function observeRecordedExit(pid, recordFile) {
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw Error("process_id_unverified");
  const stat = fs.lstatSync(recordFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size > 128 * 1024
  )
    throw Error("process_record_unavailable");
  const bytes = fs.readFileSync(recordFile),
    record = JSON.parse(bytes);
  if (record.pid !== pid) throw Error("process_record_identity_conflict");
  const basis = {
    pid,
    notRunning: true,
    meaning: "recorded_process_exited",
    recordCreatedMs: stat.birthtimeMs,
    recordSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const inUse = probe(pid);
  let createdMs;
  if (inUse) {
    const command = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($null -ne $p){ [DateTimeOffset]::new($p.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds() }`;
    const observed = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    if (observed.status !== 0 || observed.error || observed.signal)
      throw Error("process_exit_unverified");
    createdMs = Number((observed.stdout || "").trim());
    if (!createdMs && !probe(pid))
      return {
        ...basis,
        observation: "absent_after_probe",
        pidWasInUseAtProbe: true,
      };
  }
  const observation = classifyRecordedExit({
    inUse,
    createdMs,
    recordMs: stat.birthtimeMs,
  });
  return {
    ...basis,
    observation,
    pidWasInUseAtProbe: inUse,
    ...(inUse ? { currentProcessCreatedMs: createdMs } : {}),
  };
}
module.exports = { classifyRecordedExit, observeRecordedExit };
