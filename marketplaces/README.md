# Federated Marketplaces

This directory is the control-plane registry for independently owned agent marketplaces.

The federation model is repo-per-domain or repo-per-agent, following the pattern visible in the `pmcr-o` organization:

- each repository owns its own marketplace manifest;
- each marketplace owns one or more plugins;
- PMCR-O discovers and delegates instead of copying capabilities;
- AGT owns governance, audit, trust, and tool/MCP accountability;
- Aspire composes .NET and Python resources;
- Microsoft Agent Framework provides agent/subagent execution;
- child agents may run complete PMCR-O cycles and return correlated receipts to their parent.

## Capability Reuse Law

Resolution order:

1. local validated capability;
2. registered external marketplace capability;
3. creator cycle only when discovery proves a gap.

Duplicate capability creation is denied by default.

## Current federation seed

The initial verified marketplaces are:

- `pmcr-o/pmcro-agent` — PMCR-O lifecycle and creator capabilities;
- `pmcr-o/dotnet-agent` — PMCR-O integration mirror for .NET capabilities, with `dotnet/skills` retained as upstream authority;
- `pmcr-o/governance-agent` — governance domain integration.

See `registry.json` for the machine-readable catalog.

## Incremental growth

New domain repositories should be registered here only after:

1. discovery confirms the repository and marketplace manifest exist;
2. plugin identities are read from the authoritative manifest;
3. authority/provenance is recorded;
4. PMCR-O Check verifies the registration;
5. Reflect proposes the next bounded marketplace or agent increment.

The registry is a federation catalog. It is not permission to execute, install, publish, or trust a capability.
