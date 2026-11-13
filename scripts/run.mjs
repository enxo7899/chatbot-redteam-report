// Runs the suite against v1 and v2 (default) and writes docs/report.json.
//   node scripts/run.mjs            -> docs/report.json   (also prints --json to stdout with --json)
//   node scripts/run.mjs --llm      -> docs/report-llm.json (needs ANTHROPIC_API_KEY, optional)
import { readFileSync, writeFileSync } from "node:fs";
import { bots } from "../src/bot.js";
import { runSuite } from "../src/harness.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const attacks = read("../data/attacks.json");
const benign = read("../data/benign.json");
const llm = process.argv.includes("--llm");

let target = bots, out = "docs/report.json";
if (llm) {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY to run against the LLM adapter."); process.exit(2); }
  const { createLlmBot } = await import("../adapters/llm-bot.js");
  target = { llm: await createLlmBot() };
  out = "docs/report-llm.json";
}
const report = await runSuite(target, attacks, benign);
const json = JSON.stringify(report, null, 2) + "\n";
if (process.argv.includes("--json")) process.stdout.write(json);
else writeFileSync(new URL("../" + out, import.meta.url), json);

for (const [n, s] of Object.entries(report.summary)) {
  console.error(`${n}: ${s.attacksSucceeded}/${report.meta.attackCount} attacks succeeded (${s.attackSuccessRate}%), over-refusal ${s.benignRefused}/${s.benignTotal}, helpful ${s.benignHelpful}/${s.benignTotal}`);
}
for (const c of report.byCategory) console.error(c.category.padEnd(16), ...Object.keys(report.summary).map((n) => `${n} ${c[n].succeeded}/${c.total}`));
