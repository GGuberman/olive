# Fig — tests

End-to-end tests that drive a real browser through the live Fig site, the way a person would.

Two flavours live here:

1. **Deterministic suites** in `specs/` — Playwright tests with known assertions. These run on every push via GitHub Actions and tell you if something obviously broke.
2. **Exploratory agent** in `agent/run.mjs` — an LLM-driven runner that, given a goal in plain English, drives the browser and reports back what it saw. Useful for "does the new flow actually feel right" checks. Optional, requires an Anthropic key.

## First-time setup

From the repo root:

```bash
cd tests
npm install
npx playwright install chromium
```

That installs Playwright + http-server (used to serve the static files) and downloads a copy of Chromium (~170MB, one-time).

## Running the deterministic suites

```bash
npm test            # headless, prints results to terminal
npm run test:ui     # interactive Playwright UI — best for writing/debugging
npm run test:headed # watch the browser as tests run
npm run report      # open the last HTML report
```

The tests auto-start a static server on `http://localhost:8765` pointing at the parent folder. You don't need anything else running.

## What's covered

| Spec | What it checks |
|------|----------------|
| `01-home.spec.ts` | Home page sections render, three trackers in order, no Brain card, fonts swapped to Inter + Fraunces, fresh-state placeholders. |
| `02-theme.spec.ts` | Theme modal opens, Fig Light flips CSS variables to green-on-warm-white, theme persists across reload, finance inherits the chosen theme. |
| `03-settings.spec.ts` | Settings modal renders three tabs and three identity sections. Provider picker shows all four LLMs. Ollama hides the API-key field. Saving an LLM key mirrors to legacy `fig_provider` / `fig_key`. Bluesky form validates required fields. Worker handle validates allowed characters. Connected state shows the auth chip. |
| `04-wiki.spec.ts` | Wiki textarea saves to inbox, rejects empty input, appends in order, clears after submit. |
| `05-finance.spec.ts` | Finance lands on onboarding from a fresh state without errors. Emergency Reset button always visible. Back-link returns home. Theme inheritance works. |
| `06-health.spec.ts` | React app mounts and produces content. Back-link present. Old fonts (Georgia, DM Mono) are gone. |

## Adding a test

Drop a new file matching `specs/*.spec.ts`. Playwright picks it up automatically. Use the existing specs as templates — most start with a `test.beforeEach` that clears localStorage + IndexedDB so each test runs from a fresh state.

## CI

`.github/workflows/tests.yml` runs the full suite on every push to `main` and every pull request. On failure, the HTML report is uploaded as a build artifact you can download from the Actions tab.

## Exploratory agent (optional)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run agent
```

By default it runs the goal *"On the Fig home page, switch to the Fig Light theme, then add a wiki entry that says 'ran 5k'. Verify the entry counter went from 0 to 1."* You can override:

```bash
FIG_GOAL="connect Bluesky with handle alice.test and confirm the auth chip shows" \
FIG_MAX_STEPS=15 \
FIG_MODEL=claude-sonnet-4-6 \
npm run agent
```

The agent gets a screenshot + accessibility snapshot at each step and emits a JSON action (`click`, `fill`, `goto`, `wait`, `done`, `fail`). At the end it prints a report and any browser errors it observed.

This is intentionally simple — no agent framework, ~150 lines of plain JS. Treat it as a starting point. Real exploratory testing benefits from giving the model a richer toolset (e.g. screenshots of element bounding boxes, ability to read network logs, ability to assert on specific values).

## Troubleshooting

**`npm test` hangs on "starting".** Another process is on port 8765. Kill it: `lsof -ti:8765 | xargs kill`.

**Tests pass locally, fail in CI.** Likely a timing issue. Increase the timeout on the failing assertion (`{ timeout: 10_000 }`) or use `await expect(...).toHaveText(...)` instead of `getText()`.

**Browser doesn't appear in `test:headed`.** On Linux you may need `xvfb` — Playwright will tell you what to install.
