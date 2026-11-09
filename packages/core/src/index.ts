export type {
  AssertionId,
  CorrectionId,
  EventId,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "./domain/ids.js";
export { PLAN_CERTAINTIES, WORK_STATUSES } from "./domain/status.js";
export type { PlanCertainty, WorkStatus } from "./domain/status.js";
export type { Project } from "./domain/project.js";
export type { Phase } from "./domain/phase.js";
export type { Task } from "./domain/task.js";
export type { Session } from "./domain/session.js";
export { PROVENANCES } from "./domain/provenance.js";
export type { Provenance } from "./domain/provenance.js";
export type {
  EvidenceReference,
  SourceReference,
} from "./domain/source-reference.js";
export type {
  AssertionInferenceMetadata,
  AssociationHeuristicScore,
  CurrentTaskAssociationInferenceMetadata,
  InferenceHeuristicScore,
  InferenceMetadata,
} from "./domain/inference.js";
export type {
  Assertion,
  AssertionTarget,
  TaskWeight,
} from "./domain/assertion.js";
export type {
  ResolvedConclusion,
  ResolutionMetadata,
} from "./domain/resolved-conclusion.js";
export type {
  NormalizedEvent,
  NormalizedEventType,
  PlanInput,
  PlanPhaseInput,
  PlanStepInput,
  SessionEventInput,
  SourceEventIdentity,
  TaskStatusReport,
} from "./domain/normalized-event.js";
export type {
  CorrectionLifecycle,
  CorrectionRecord,
  CorrectionScope,
} from "./domain/correction.js";
export type { TimelineReference } from "./domain/timeline-reference.js";
export type { InterpretationState } from "./domain/interpretation-state.js";
export type { CoreState } from "./state.js";
export { createCoreState } from "./state.js";
export type {
  EventApplicationResult,
  EventRejectionReason,
} from "./apply-event.js";
export { applyNormalizedEvent } from "./apply-event.js";
export {
  getAssertion,
  getAssertionsForTarget,
  getPhase,
  getProject,
  getSession,
  getTask,
  hasProcessedEvent,
} from "./queries.js";
export {
  applyPlanEvent,
  createPlanEngineState,
  getPlanSnapshot,
} from "./plan-engine.js";
export type {
  PlanApplicationResult,
  PlanChange,
  PlanChangedEvent,
  PlanEngineState,
  PlanEntry,
  PlanHead,
  PlanIssue,
  PlanPhase,
  PlanRevision,
  PlanScope,
  PlanSnapshotResult,
} from "./domain/plan.js";
export {
  calculateProgress,
  createProgressEngineState,
  formatProgressPercentage,
  updateProgress,
} from "./progress-engine.js";
export type {
  IndependentVerificationSupport,
  ProgressApplicationResult,
  ProgressChangeReason,
  ProgressChangedEvent,
  ProgressEngineState,
  ProgressEvidenceReference,
  ProgressIssue,
  ProgressIssueCode,
  ProgressPhaseTotal,
  ProgressResult,
  ProgressTaskBasis,
} from "./domain/progress.js";

export {
  applyUserCorrection,
  expireUserCorrection,
  getUserCorrectedCurrentTask,
} from "./correction-engine.js";
export type {
  UserCorrectionInput,
  CorrectionExpiryInput,
  CorrectionEngineEvent,
  CorrectionApplicationResult,
  UserCorrectedCurrentTask,
} from "./correction-engine.js";

export {
  createTimelineState,
  appendTimelineEvents,
  getTimelineEntries,
} from "./timeline-engine.js";
export type {
  TimelineInput,
  TimelineProgress,
  TimelineKind,
  TimelineEntry,
  TimelineState,
  TimelineQuery,
  TimelineApplicationResult,
} from "./timeline-engine.js";

export { getTimelinePage } from "./timeline-pagination.js";
export type {
  TimelineCursor,
  TimelinePageQuery,
  TimelinePageResult,
} from "./timeline-pagination.js";

export {
  createProjectEngineState,
  applyProjectUpdate,
} from "./project-engine.js";
export type {
  ProjectEngineState,
  ProjectUpdate,
  ProjectUpdateResult,
} from "./project-engine.js";

export { getTaskHistory } from "./task-history.js";
export type {
  TaskPlanHistoryEntry,
  TaskCorrectionHistory,
  TaskHistoryResult,
} from "./task-history.js";

export { getTimelineEntryDetails } from "./timeline-details.js";
export type {
  TimelineEvidenceRecord,
  TimelineEvidenceResolution,
  TimelineEntryDetailsResult,
} from "./timeline-details.js";
