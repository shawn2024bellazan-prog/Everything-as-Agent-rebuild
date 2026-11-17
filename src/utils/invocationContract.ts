import type { DynamicSkillDefinition, DynamicSkillRun } from './dynamicSkillRuntime';

export const INVOCATION_RESULT_VERSION = 'pmcro.agent-invocation-result/v1';

type AgentStatus = 'completed' | 'proposed' | 'blocked' | 'failed' | 'halted';
type Disposition = 'proposed' | 'accept' | 'retry' | 'reject' | 'halt' | 'partial';

export interface InvocationResult {
  contractVersion: typeof INVOCATION_RESULT_VERSION;
  invocation: {
    invocationId: string;
    parentInvocationId: string | null;
    cycleId: string;
    runId: string | null;
    agentRef: string;
    serviceRef: string | null;
    nestedTrailRef: string | null;
  };
  agent: { role: 'maker'; status: AgentStatus; summary: string };
  reasoning: {
    selectionRef: string | null;
    strategyId: string;
    family: string | null;
    rationale: string;
    modelProfile: string | null;
    operatorOverride: string | null;
  };
  intent: {
    skillsToExecute: { skillRef: string; purpose: string; argumentsRef: string | null }[];
    callsToMake: {
      callId: string;
      kind: 'workflow' | 'service';
      target: string;
      operation: string;
      argumentsRef: string | null;
      schemaRef: string | null;
      approvalClass: 'policy-eligible' | 'human-required';
    }[];
    checkCriteria: string[];
    reflectIntent: Record<string, never>;
    presentationProfileRef: string | null;
  };
  executionRecord: {
    authorizedCalls: string[];
    executedCalls: string[];
    deniedCalls: string[];
    approvalReceiptRefs: string[];
    evidenceRefs: string[];
  };
  result: { disposition: Disposition; summary: string; reason: string | null; readyForParentGate: boolean };
}

const AGENT_STATUS: Record<DynamicSkillRun['status'], AgentStatus> = {
  QUEUED: 'proposed',
  RUNNING: 'proposed',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMED_OUT: 'failed',
  CANCELLED: 'halted',
};

// A completed run is only "partial": this runtime never invokes an independent Checker.
const DISPOSITION: Record<DynamicSkillRun['status'], Disposition> = {
  QUEUED: 'proposed',
  RUNNING: 'proposed',
  COMPLETED: 'partial',
  FAILED: 'reject',
  TIMED_OUT: 'retry',
  CANCELLED: 'halt',
};

function pluginNameFromSourceNamespace(sourceNamespace: string) {
  const segments = sourceNamespace.split('/').map((segment) => segment.trim()).filter(Boolean);
  return segments.at(-1) ?? sourceNamespace;
}

function capabilityRefs(skill: DynamicSkillDefinition) {
  const pluginName = pluginNameFromSourceNamespace(skill.sourceNamespace);
  return {
    pluginRef: `plugin://${pluginName}`,
    skillRef: `skill://${pluginName}/${skill.id}`,
  };
}

function describeCall(skill: DynamicSkillDefinition) {
  if (skill.runtimeTarget === 'github-actions') {
    return { kind: 'workflow' as const, target: `${skill.githubRepo}/${skill.workflowFile}`, operation: 'prepare-workflow-dispatch' };
  }
  if (skill.runtimeTarget === 'local-ollama') {
    return { kind: 'service' as const, target: 'ollama', operation: 'generate' };
  }
  return { kind: 'service' as const, target: 'bounded-rehearsal', operation: 'rehearse' };
}

/**
 * Maps a control-plane skill run onto the PMCR-O agent invocation result contract.
 * Honest by construction: no Checker ran and run records are in memory, so a completed
 * run is `partial`, is not ready for a parent gate, and carries no evidence refs.
 */
export function buildInvocationResult(
  run: DynamicSkillRun & { approvalReceiptRef?: string },
  skill: DynamicSkillDefinition,
  options: { cycleId?: string } = {}
): InvocationResult {
  const callId = `${run.runId}:call-1`;
  const call = describeCall(skill);
  const gated = skill.policy.requiresApprovalGate;
  const completed = run.status === 'COMPLETED';
  const capability = capabilityRefs(skill);
  return {
    contractVersion: INVOCATION_RESULT_VERSION,
    invocation: {
      invocationId: run.runId,
      parentInvocationId: null,
      cycleId: options.cycleId ?? `cycle-${run.runId}`,
      runId: run.runId,
      agentRef: '@control-plane',
      serviceRef: capability.pluginRef,
      nestedTrailRef: null,
    },
    agent: { role: 'maker', status: AGENT_STATUS[run.status], summary: (run.output ?? '').slice(0, 240) },
    reasoning: {
      selectionRef: null,
      strategyId: 'operator-selected-policy-gated',
      family: null,
      rationale: 'The operator selected the skill and the server-side policy gate decided admission. No model chose the action.',
      modelProfile: skill.runtimeTarget === 'local-ollama' ? skill.ollamaModel : null,
      operatorOverride: null,
    },
    intent: {
      skillsToExecute: [{ skillRef: capability.skillRef, purpose: skill.summary || skill.id, argumentsRef: null }],
      callsToMake: [
        {
          callId,
          ...call,
          argumentsRef: null,
          schemaRef: null,
          approvalClass: gated ? 'human-required' : 'policy-eligible',
        },
      ],
      checkCriteria: [],
      reflectIntent: {},
      presentationProfileRef: null,
    },
    executionRecord: {
      authorizedCalls: [callId],
      executedCalls: completed ? [callId] : [],
      deniedCalls: [],
      approvalReceiptRefs: run.approvalReceiptRef ? [run.approvalReceiptRef] : [],
      evidenceRefs: [],
    },
    result: {
      disposition: DISPOSITION[run.status],
      summary: `Run ${run.runId} of "${skill.id}" is ${run.status}.`,
      reason: completed ? 'No independent Checker ran and no evidence was persisted, so the run is not verified.' : (run.cancelReason ?? null),
      readyForParentGate: false,
    },
  };
}
