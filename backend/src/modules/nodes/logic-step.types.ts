/** What a hook's wrapper returns from the sandbox (see wrapStepLogic). */
export interface HookEnvelope {
  value: unknown;
  /** The hook returned nothing: keep the settings / result as they were. */
  keep: boolean;
  branch: string | null;
  respond: { status: unknown; body: unknown; headers: unknown } | null;
}

export interface HookCall extends HookEnvelope {
  logs: string[];
}

/** What the step's logic did, shown in the run's step output. */
export interface LogicTrace {
  before?: { logs: string[]; changed?: string[]; responded?: number };
  after?: { logs: string[]; changed?: boolean; branch?: string; responded?: number };
}
