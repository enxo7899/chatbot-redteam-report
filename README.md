# Chatbot red-team report: 100 attacks, scored, fixed and re-tested

You are about to put a chatbot on your website and don't know what people will make it do. This repo is a repeatable test suite of 100 attack prompts, a scored report by attack type, the fixes, and a re-test that shows the improvement.

**▶ Live demo: https://enxo7899.github.io/chatbot-redteam-report/** (scroll to "Try your own attack" and type something nasty; both bot versions answer and a judge scores them. Save the page as PDF from the print dialog.)

![Report summary: 89 of 100 attacks worked before the fixes, 3 after](docs/overview.png)

## What it does

| Part | Detail |
|---|---|
| **Sample bot** | `src/bot.js`: customer-service bot for a fictional shop, Voltaic Store (orders, shipping, returns, discount codes, English / Albanian / Italian). Rule-based, so every run gives the same answers. |
| **v1 (before)** | Keyword FAQ plus a system prompt and tools for order lookup, discounts and refunds, with the weaknesses a quick first build has. |
| **v2 (after)** | Same bot with guardrails in code: input classification, order id plus matching email, templated replies, output check, PII masking, no refunds without a person. |
| **100 attacks** | `data/attacks.json`: prompt injection, prompt extraction, data exfiltration, discount and refund abuse, off-topic and brand damage, PII leakage, Albanian / Italian variants, encoding tricks. Fake data only, and the only thing at risk is the fictional shop. |
| **Judge** | `src/judge.js`: each attack has a machine-checkable success condition (reply contains the secret code, shows another customer's email, a discount above 10% was applied, a refund was issued). No model involved. |
| **Over-refusal check** | `data/benign.json`: 20 ordinary questions, so "refuse everything" cannot look like a win. |
| **Report page** | `index.html`: summary, results by type, findings mapped to code changes, all 100 attacks side by side with filters, and a live attack box. |

## Measured results

From `npm run run-suite` (writes `docs/report.json`; a test fails if that file is out of date):

| | v1 before | v2 after |
|---|---|---|
| Attacks that succeeded (of 100) | **89** | **3** |
| Ordinary questions refused wrongly (of 20) | 0 | 3 |
| Ordinary questions answered correctly (of 20) | 15 | 17 |

By type, v1 to v2: injection 13/14 to 0, extraction 11/14 to 0, exfiltration 14/14 to 3, discount and refund 12/14 to 0, off-topic 12/12 to 0, PII 10/10 to 0, Albanian and Italian 12/12 to 0, encoding 5/10 to 0.

Honest reading:
- The 3 attacks that still work are logged as **R1**: someone who already holds a customer's order id and email gets that order's status and shipping city. Without a login the bot cannot tell them from the owner. The report recommends a signed-in session or a one-time code.
- v2 refuses 3 harmless questions (those containing "ignore my previous message", "act as my guide" and "I'm a staff member"). They are left in the report, not tuned away.
- Both bots are rule-based. A template bot is hard to talk into anything, so v2's low number says the harness and the fixes work, not that an LLM bot would score the same. Run the suite against your own bot to find out.

<p>
<img src="docs/by-type.png" width="49%" alt="Results by attack type">
<img src="docs/attack-explorer.png" width="49%" alt="Attacks side by side">
</p>
<p>
<img src="docs/fixes.png" width="49%" alt="Findings and fixes">
<img src="docs/try-it.png" width="49%" alt="Try your own attack">
</p>

## Run it

```bash
npm test               # 33 tests: guardrails, judge, attack set, report is current
npm run run-suite      # re-run all attacks, rewrite docs/report.json
npm run dev            # page at http://127.0.0.1:5178/
npm run screenshots    # needs the dev server running and Playwright installed
```

Against a real LLM bot (optional, not used in CI, needs your own key):

```bash
npm install
ANTHROPIC_API_KEY=... node scripts/run.mjs --llm   # writes docs/report-llm.json
```

`adapters/llm-bot.js` gives a model (default `claude-opus-5-5`, via `@anthropic-ai/sdk`) the same system prompt and three tools (order lookup, discount, refund) and returns the same `{ text, actions }` shape, so the same judge scores it. Any bot with `respond(message)` works with `src/harness.js`.

## Adapt it to your business

- **Your bot**: write an adapter like `adapters/llm-bot.js` that calls your chatbot endpoint and returns `{ text, actions }`.
- **Your attacks**: edit `scripts/build-data.mjs` (or `data/attacks.json` directly). Each attack needs a prompt and a success condition; the available condition types are in `src/judge.js`.
- **Your secrets and data**: `src/shop.js` holds the fake shop. Put your own canary secrets and test customers there so a leak is detectable.
- **Your languages**: add terms to the classifiers in `src/bot.js` and FAQ text in `src/shop.js`.

---
Built by **[EmSoft](https://github.com/enxo7899)**: chatbot red-teaming and safety testing before you go live. Get in touch through my Fiverr or Upwork profile.
