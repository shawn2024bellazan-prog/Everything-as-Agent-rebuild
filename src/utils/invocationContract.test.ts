import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { buildDynamicSkillDefinition, type DynamicSkillRun } from './dynamicSkillRuntime';
import { buildInvocationResult } from './invocationContract';

const schema = JSON.parse(readFileSync(new URL('../../contracts/agent-invocation-result.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

function skillWith(target: 'github-actions' | 'local-ollama' | 'bounded-rehearsal', gate: boolean) {
  const created = buildDynamicSkillDefinition({
    id: `s-${target}`,
    sourceNamespace: 'pmcr-o/skills',
    summary: 'test skill',
    trigger: 'manual',
    runtimeTarget: target,
    ollamaModel: 'qwen2.5-coder:7b',
    githubRepo: 'pmcr-o/skills',
    workflowFile: 'skill.yml',
    timeoutMs: 15000,
    requiresApprovalGate: gate,
  });
  assert.ok(created.ok, 'skill fixture must build');
  return created.skill;
}

function runWith(status: DynamicSkillRun['status'], extra: Partial<DynamicSkillRun> = {}): DynamicSkillRun {
  return {
    runId: 'run-abc',
    skillId: 's',
    seed: 'x',
    status,
    runtimeTarget: 'bounded-rehearsal',
    startedAt: '2026-11-15T00:00:00.000Z',
    trailFrames: [],
    ...extra,
  };
}

test('every run status yields a result that satisfies the real contract schema', () => {
  for (const target of ['github-actions', 'local-ollama', 'bounded-rehearsal'] as const) {
    for (const status of ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED'] as const) {
      const out = buildInvocationResult(runWith(status), skillWith(target, target === 'github-actions'));
      assert.equal(validate(out), true, `${target}/${status}: ${JSON.stringify(validate.errors)}`);
    }
  }
});

test('the validator rejects a result with a required block removed', () => {
  const out: Record<string, unknown> = { ...buildInvocationResult(runWith('COMPLETED'), skillWith('bounded-rehearsal', false)) };
  delete out.executionRecord;
  assert.equal(validate(out), false);
});

test('a completed run is never accept and never ready for a parent gate', () => {
  const out = buildInvocationResult(runWith('COMPLETED'), skillWith('github-actions', true));
  assert.equal(out.result.disposition, 'partial');
  assert.equal(out.result.readyForParentGate, false);
  assert.deepEqual(out.executionRecord.evidenceRefs, []);
});

test('gated skills carry the approval receipt and a human-required call', () => {
  const out = buildInvocationResult(runWith('COMPLETED', { approvalReceiptRef: 'approval:abc' } as never), skillWith('github-actions', true));
  assert.deepEqual(out.executionRecord.approvalReceiptRefs, ['approval:abc']);
  assert.equal(out.intent.callsToMake[0].approvalClass, 'human-required');
  assert.equal(out.intent.callsToMake[0].kind, 'workflow');
});

test('only completed runs list the call as executed', () => {
  const sk = skillWith('bounded-rehearsal', false);
  assert.equal(buildInvocationResult(runWith('COMPLETED'), sk).executionRecord.executedCalls.length, 1);
  assert.equal(buildInvocationResult(runWith('FAILED'), sk).executionRecord.executedCalls.length, 0);
  assert.equal(buildInvocationResult(runWith('CANCELLED', { cancelReason: 'killed' }), sk).result.reason, 'killed');
});

test('every invocation emits plugin, skill, and concrete function provenance', () => {
  const created = buildDynamicSkillDefinition({
    id: 'workflow-dispatch',
    sourceNamespace: 'pmcr-o/github-agent',
    summary: 'dispatch workflow',
    trigger: 'workflow_dispatch',
    runtimeTarget: 'github-actions',
    ollamaModel: 'qwen2.5-coder:7b',
    githubRepo: 'pmcr-o/skills',
    workflowFile: 'skill.yml',
    timeoutMs: 15000,
    requiresApprovalGate: true,
  });
  assert.ok(created.ok, 'skill fixture must build');
  if (!created.ok) return;

  const out = buildInvocationResult(runWith('COMPLETED'), created.skill);
  assert.equal(out.invocation.serviceRef, 'plugin://github-agent');
  assert.equal(out.intent.skillsToExecute[0].skillRef, 'skill://github-agent/workflow-dispatch');
  assert.equal(out.intent.callsToMake[0].target, 'pmcr-o/skills/skill.yml');
  assert.equal(out.intent.callsToMake[0].operation, 'prepare-workflow-dispatch');
});
