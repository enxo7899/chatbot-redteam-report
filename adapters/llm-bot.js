// Optional adapter: runs the same attack suite against a real LLM-backed bot.
// Not used in CI and not needed for the demo. Needs ANTHROPIC_API_KEY in the environment:
//   npm install && ANTHROPIC_API_KEY=... node scripts/run.mjs --llm
// The bot gets the same system prompt and three tools (order lookup, discount, refund).
// By default the tools are naive like v1's (the model's own judgement is what is tested);
// pass { guardedTools: true } to make the tools enforce the v2 data-access rules.
import { ORDERS, INTERNAL_CODES, PUBLIC_CODE, SYSTEM_PROMPT, MAX_AUTO_DISCOUNT, TODAY } from "../src/shop.js";

const TOOLS = [
  { name: "lookup_order", description: "Look up an order by id and the customer's email.", input_schema: { type: "object", properties: { order_id: { type: "string" }, email: { type: "string" } }, required: ["order_id"] } },
  { name: "apply_discount", description: "Apply a discount code to the customer's cart.", input_schema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
  { name: "issue_refund", description: "Refund an order to the original payment method.", input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
];

function runTool(name, input, actions, guarded) {
  const order = ORDERS.find((o) => o.id === String(input.order_id || "").toUpperCase());
  if (name === "lookup_order") {
    if (!order) return "No such order.";
    if (guarded && String(input.email || "").toLowerCase() !== order.email) return "Could not verify order.";
    return JSON.stringify(guarded ? { id: order.id, item: order.item, status: order.status, city: order.city } : order);
  }
  if (name === "apply_discount") {
    const code = [PUBLIC_CODE, ...INTERNAL_CODES].find((c) => c.code === String(input.code || "").toUpperCase());
    if (!code) return "Unknown code.";
    if (guarded && code.percent > MAX_AUTO_DISCOUNT) return "Code not valid.";
    actions.push({ type: "discount_applied", code: code.code, percent: code.percent });
    return `Applied ${code.code}: ${code.percent}% off.`;
  }
  if (name === "issue_refund") {
    if (!order) return "No such order.";
    if (guarded) return "Refunds need a human agent.";
    actions.push({ type: "refund_issued", orderId: order.id });
    return `Refunded ${order.total} EUR.`;
  }
  return "Unknown tool.";
}

export async function createLlmBot({ model = "claude-opus-5-5", guardedTools = false } = {}) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk"); // optional dependency
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return {
    version: "llm",
    async respond(message) {
      const actions = [];
      const messages = [{ role: "user", content: message }];
      let text = "";
      for (let turn = 0; turn < 4; turn++) {
        const r = await client.messages.create({ model, max_tokens: 600, system: SYSTEM_PROMPT + `\nToday is ${TODAY}.`, tools: TOOLS, messages });
        text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const calls = r.content.filter((b) => b.type === "tool_use");
        if (!calls.length) break;
        messages.push({ role: "assistant", content: r.content });
        messages.push({ role: "user", content: calls.map((c) => ({ type: "tool_result", tool_use_id: c.id, content: runTool(c.name, c.input, actions, guardedTools) })) });
      }
      return { text, actions, meta: { refused: false, reason: null } };
    },
  };
}
