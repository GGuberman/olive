# Fig — Roadmap & Open Threads

Notes on direction. Living doc.

## Now (shipped / in flight)

- Personal wiki on the home page that summarizes habits, lists active goals, and accepts plain-English updates.
- Health tracker (weight, habits, workouts, nutrition) with AI auto-fill.
- Finance tracker (cash flow, spending, goals, net worth).
- Local-first: data stays on device (localStorage + IndexedDB).
- Theme system with presets and custom colors.

## Next

- Wire the wiki text input to an LLM router so a single update like "Slept 7h, ran 5k, spent $84 on groceries" flows into Health and Finance automatically and then re-summarizes the wiki.
- Custom tracker creation — let users describe a tracker in plain English (sleep, mood, reading, deep work) and have Fig draft a schema + form + summary template.
- Cross-domain prompts in the wiki: "you spend more on takeout the weeks you skip workouts" — patterns surfaced from co-occurring health + finance data.

## Fig Earn (longer term)

The goal is a rewards layer for people who consistently show up — financially and physically. Habits become an asset. Streaks unlock real perks.

### World ID + AgentKit thesis

Instead of bolting on Plaid (expensive, US-centric, walled-garden), explore **World ID** as the identity + payment + agent rail:

- **World ID** = unique-human proof. Solves Sybil — one healthy, financially responsible person can't claim 50 identities of rewards. Critical for any insurer/government-funded incentive.
- **AgentKit** = trusted agents that can fetch data from banks, brokerages, payroll, etc. on the user's behalf — without paying Plaid and without Fig holding raw credentials. The agent runs scoped, ephemeral, user-authorized; Fig only sees the aggregates it needs.
- Combination → an open, low-cost, privacy-respecting alternative to the current "verify identity → connect bank → sell anonymized data" pipeline.

### Funding model — "incentivize socially good behavior"

The thesis is that healthy, financially responsible people are valuable to several payors who today have no clean way to reach them:

- **Insurers** (health, life, auto, renters): pay to reduce claims risk. A consistent Fig user with a multi-month streak of healthy habits + stable savings rate is genuinely lower risk and worth a rate discount or rebate.
- **Governments / public programs**: pay to reduce downstream public-health and welfare costs. Healthy, financially stable citizens cost the system less. A means-tested wellness/savings rebate paid through Fig is cheaper than treating preventable disease or stabilizing late-stage financial distress.
- **Employers**: pay for retention + lower group-insurance premiums. Wellness stipends that actually correlate with behavior, not just gym sign-ups.

Fig sits in the middle as a neutral verifier. World ID guarantees one human; AgentKit verifies the underlying signals (workouts logged, savings achieved); Fig issues an attestation; the payor pays the rebate to the user.

### Privacy posture (non-negotiable)

- User opts in per program, per data category.
- Payors see attestations ("90-day savings streak met", "BMI in target range for 6 months") — never raw transactions, never raw weights.
- Fig never sells data. Ever. The only revenue from a payor is the program fee for processing eligibility — not data licensing.

### Open questions

- How much of the verification can run client-side / in a TEE so even Fig doesn't see the raw signals?
- Are there programs where users would accept Fig posting an on-chain attestation tied to their World ID, vs. keeping it fully off-chain?
- What's the smallest credible pilot — one insurer, one cohort, one habit?
- Can AgentKit hit a US bank reliably enough to displace Plaid for our use case, or does this start outside the US where Plaid coverage is bad anyway?
- Floor: what does the product look like if Fig Earn never gets payor partnerships? (Answer: still a great personal-wiki tracker. Earn is upside, not foundation.)

## Principles

- Local-first by default. Cloud is opt-in, per feature, per user.
- The wiki is the product. Trackers feed the wiki, not the other way around.
- Don't ship a tracker we wouldn't use ourselves daily.
- Boring tech where possible; agentic tech where it actually beats the boring version.
