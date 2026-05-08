// Fig — exploratory user agent
//
// Drives a real browser through Fig with an LLM at the wheel. Unlike the
// deterministic suites in /specs which assert known outcomes, this agent
// is given a high-level goal ("sign up, log a wiki entry, and check that
// it appears") and uses Claude + Playwright to figure out how to do it,
// then reports anything that looked broken.
//
// Run:
//   ANTHROPIC_API_KEY=sk-ant-... npm run agent
//
// Optionally:
//   FIG_GOAL="switch to Fig Light theme then add a wiki entry"
//   FIG_MAX_STEPS=15
//   FIG_BASE_URL=http://localhost:8765
//
// This is intentionally small and dependency-light — no agent framework,
// just the SDK + Playwright. Treat it as a starting point you can extend.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const GOAL = process.env.FIG_GOAL || 'On the Fig home page, switch to the Fig Light theme, then add a wiki entry that says "ran 5k". Verify the entry counter went from 0 to 1.';
const MAX_STEPS = parseInt(process.env.FIG_MAX_STEPS || '12', 10);
const BASE = process.env.FIG_BASE_URL || 'http://localhost:8765';
const MODEL = process.env.FIG_MODEL || 'claude-sonnet-4-6';

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Export it before running:');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// Start a static server if FIG_BASE_URL is the default and nothing is up there
async function ensureServer() {
  if (BASE !== 'http://localhost:8765') return null;
  try {
    const r = await fetch(BASE + '/index.html');
    if (r.ok) return null;
  } catch {}
  console.log('[agent] starting http-server on :8765');
  const proc = spawn('npx', ['http-server', '..', '-p', '8765', '-c-1', '--silent'], {
    stdio: 'ignore', detached: true,
  });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try { const r = await fetch(BASE + '/index.html'); if (r.ok) return proc; } catch {}
  }
  throw new Error('http-server did not come up');
}

const SYSTEM = `You are a careful QA agent driving a Playwright browser through Fig — a personal-wiki / health / finance web app.
You are given a screenshot and the page's accessibility snapshot at every step.
Respond ONLY with one JSON object describing your next action. No prose, no markdown fences.

Schema:
{ "thought": "<one sentence: what you're trying to do>",
  "action": "click" | "fill" | "goto" | "wait" | "done" | "fail",
  "selector"?: "<CSS selector or text=...>",
  "value"?: "<for fill or goto>",
  "report"?: "<final summary if action is done or fail>" }

Rules:
- Prefer text= or role-based selectors over fragile CSS.
- Use action "done" with a short report when the goal is achieved.
- Use "fail" when something is genuinely broken (missing element, JS error, can't progress) and explain what.
- Don't go in loops — if a click does nothing twice, try a different approach or fail.
- Goal: ${GOAL}`;

async function callClaude(messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages,
    }),
  });
  if (!r.ok) throw new Error('Claude API ' + r.status + ': ' + await r.text());
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

function parseAction(s) {
  // Tolerate accidental ```json fences
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in model reply: ' + s);
  return JSON.parse(m[0]);
}

async function main() {
  const serverProc = await ensureServer();
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

  await page.goto(BASE + '/index.html');

  const messages = [];
  let lastReport = null;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    const screenshot = await page.screenshot({ fullPage: false });

    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } },
        { type: 'text', text: `Step ${step}/${MAX_STEPS}. URL: ${page.url()}\nAccessibility tree (truncated):\n${JSON.stringify(snapshot, null, 2).slice(0, 4000)}\nDecide the next action.` },
      ],
    });

    const reply = await callClaude(messages);
    messages.push({ role: 'assistant', content: reply });
    let action;
    try { action = parseAction(reply); } catch (e) { console.error('Bad reply:', reply); throw e; }
    console.log(`[step ${step}] ${action.action} ${action.selector || ''} ${action.value || ''} — ${action.thought}`);

    try {
      if (action.action === 'done')   { lastReport = action.report || 'done'; break; }
      if (action.action === 'fail')   { lastReport = 'FAIL: ' + (action.report || 'no reason given'); break; }
      if (action.action === 'goto')   await page.goto(action.value);
      if (action.action === 'click')  await page.locator(action.selector).first().click({ timeout: 5000 });
      if (action.action === 'fill')   await page.locator(action.selector).first().fill(action.value);
      if (action.action === 'wait')   await sleep(parseInt(action.value || '500', 10));
    } catch (e) {
      // Tell the model the action failed so it can adjust
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Action failed: ' + e.message + '. Try a different approach.' }] });
    }
  }

  console.log('\n──── REPORT ────');
  console.log(lastReport || 'Hit step cap without finishing.');
  if (errors.length) {
    console.log('\nBrowser errors observed:');
    errors.forEach(e => console.log(' ', e));
  } else {
    console.log('\nNo browser errors observed.');
  }

  await browser.close();
  if (serverProc) try { process.kill(-serverProc.pid); } catch {}
}

main().catch(e => { console.error(e); process.exit(1); });
