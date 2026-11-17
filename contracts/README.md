# Agent invocation contracts (vendored)

The agent invocation JSON Schemas are copies, not the source of truth.

- Source: `pmcr-o/pmcro-agent`, branch `architecture/cross-platform-agent-contract`, path `.agents/contracts/`
- Commit: `eb0ed8b82b31b1b264b9277fe09fd4f30847ed8c` (2026-11-02, unmerged at the time of copying)
- Replace these files with the merged versions when that branch lands, and keep `src/utils/invocationContract.test.ts` green.

The control plane emits `pmcro.agent-invocation-result/v1` records for terminal skill runs. See `src/utils/invocationContract.ts`.

## Marketplace federation contract

`marketplace-federation-registry.schema.json` is owned by this control-plane repository. It validates the machine-readable registry at `marketplaces/registry.json`.

The registry is descriptive and provenance-aware. Registration does not grant installation, execution, publication, trust, or authority. PMCR-O capability discovery and AGT governance remain required before effects are authorized.
