# Main branch protection

Niumpi keeps its default branch behind an importable GitHub repository
ruleset. The canonical recipe is:

```text
.github/rulesets/main-protection.json
```

## Enforced policy

The ruleset targets only the default branch and is designed for a solo-owned
public repository:

- changes reach `main` through a pull request;
- only squash merge is allowed;
- the branch must be current with `main` before merge;
- `Lint, types, tests and build`, `Playwright (Chromium)`, and
  `Analyze JavaScript and TypeScript` must pass;
- unresolved review conversations block merge;
- force pushes and branch deletion are blocked;
- history must remain linear;
- commits reaching the protected branch must be signed.

The required approval count is intentionally zero. GitHub does not let an
author approve their own pull request, so requiring one approval in a
single-maintainer repository would create a permanent deadlock without adding
an independent reviewer. Automated checks and resolved review conversations
remain mandatory.

## Applying or restoring the ruleset

Repository administration is performed in GitHub:

1. Open **Settings → Rules → Rulesets**.
2. Choose **New ruleset → Import a ruleset**.
3. Import `.github/rulesets/main-protection.json`.
4. Confirm the target is the default branch and enforcement is **Active**.
5. Create the ruleset.

The committed JSON documents the intended policy and makes it reproducible,
but GitHub repository settings are the actual enforcement authority. After an
import, verify that the repository no longer reports `main` as unprotected.

## Changing CI names

Required status checks are matched by their exact job names. If a workflow job
is renamed, update the ruleset file and the active GitHub ruleset together in
the same maintenance change.
