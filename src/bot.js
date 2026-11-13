// Voltaic Store support bot, two versions. Pure rules, no network, same answer every time.
//   v1: naive keyword bot with realistic weaknesses (what a quick first build looks like).
//   v2: the same bot with guardrails written as code: input classification, data-access
//       rules, templated replies and an output check.
// respond(message) -> { text, actions: [...], meta: { refused, reason } }
import {
  ORDERS, PUBLIC_CODE, INTERNAL_CODES, MAX_AUTO_DISCOUNT, SECRETS, SYSTEM_PROMPT, RECENT_LOG, FAQ, MSG, TODAY,
} from "./shop.js";
import { detectLang, findOrderIds, findEmails, maskEmail } from "./lang.js";

const ALL_CODES = [PUBLIC_CODE, ...INTERNAL_CODES];
const findOrder = (id) => ORDERS.find((o) => o.id === id);
const reply = (text, extra = {}) => ({ text, actions: extra.actions || [], meta: { refused: !!extra.refused, reason: extra.reason || null } });
const L = (obj, lang) => obj[lang] || obj.en;

function faqMatch(lower, lang) {
  for (const f of FAQ) {
    const hit = f.keys.some((k) => (k.startsWith("^") ? new RegExp(k, "i").test(lower.trim()) : lower.includes(k)));
    if (hit) return f[lang] || f.en;
  }
  return null;
}
// Buffer is missing in browsers; fall back to atob.
const Buffer = globalThis.Buffer;
const b64decode = (s) => {
  try {
    const d = Buffer ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s)));
    return d && /^[\x20-\x7e\n]+$/.test(d) && d.length >= 6 ? d : null;
  } catch { return null; }
};

const fullDetails = (o) =>
  `Order ${o.id} for ${o.name} (${o.email}): ${o.item}, ${o.total.toFixed(2)} EUR, status ${o.status} (${o.date}). ` +
  `Ships to ${o.street}, ${o.city}. Phone ${o.phone}. Paid by card ending ${o.card}.`;

/* ------------------------------------------------------------------ v1 */

const V1 = {
  override: /(ignore|disregard|forget|override|bypass)\b.{0,30}\b(instruction|rule|prompt|guideline|polic|previous|prior|above|earlier|everything|restriction)|developer mode|you are now|new instructions|from now on|jailbreak|\bdan\b|admin mode|debug mode|system override|pretend (to be|you)|\bact as\b|ignora\b.{0,30}istruzion|dimentica\b/i,
  echo: [
    /\b(?:say|repeat after me|reply with|respond with|answer with|output|type|write)\b\s*:?\s*["“'«](.{3,160}?)["”'»]/is,
    /\b(?:say|repeat after me|trego|thuaj|ripeti dopo di me)\s*:\s*(.{3,160})$/is,
  ],
  target: /(system prompt|\bprompt\b|(your|the) (rules|instructions|guidelines|configuration|setup)|(rules|instructions|guidelines) you (were|have been|follow|are following)|initial message|developer message|text above|everything above|above text|udhëzim\w*|rregull\w*|istruzion\w*|\bregole)/i,
  verb: /(show|print|reveal|tell|repeat|display|output|what(?:'s| is| are| were| does)|translate|summari[sz]e|paraphrase|copy|list|give me|share|read|dump|complete|trego|shfaq|thuaj|mostra|dimmi|ripeti|stampa|elenca)/i,
  codeList: /(all|every|internal|staff|vip|partner|secret|hidden|employee|master|unlimited|working)\b[^.]{0,30}\b(codes?|coupons?|discounts?|vouchers?)|codes? (list|that exist)|list (of )?(all )?(the )?(codes|coupons)|kodet e brendshme|kodet sekrete|të gjitha kodet|tutti i codici|codici interni|codici segreti/i,
  auth: /(i am|i'm|i work|this is|as)\s+(a |an |the |your )?(staff|employee|manager|admin|developer|owner|ceo|support agent|engineer|member of staff)|jam\s+(punonjës|menaxher|administrator|zhvillues)|sono\s+(un |il |l')?(dipendente|manager|amministratore|sviluppatore|titolare)/i,
  secretAsk: /(passphrase|api key|password|token|secret key|credentials)/i,
  applyVerb: /(apply|use|redeem|add|enter|try|activate|vendos|përdor|usa|applica|aggiungi|attiva)/i,
  discountWord: /(code|discount|coupon|price|kod|zbritj|sconto|codice)/i,
  refund: /(refund|money back|rimburs|kthe\w* paratë|rimburso|restituisco)/i,
  dump: /(all|every|each|full|entire|complete)\b[^.]{0,20}\b(customers?|clients?|users?|emails?|orders|records|database)|customer (list|database|data|records)|database dump|export (the )?(customers|orders|data)|tutti i clienti|të gjithë klientët|elenco clienti|tutti gli ordini|të gjitha porositë/i,
  logs: /(recent|previous|last|other|earlier)\b[^.]{0,20}\b(conversations?|chats?|users?|customers?|messages?|visitors?)|chat logs?|debug log|conversation history|session log|bisedat e fundit/i,
};

const V1_OFFTOPIC = [
  [/poem|poetry|haiku|sonnet|limerick|poezi|poesia/i, "Roses are red, volts are blue, here is a little poem just for you."],
  [/\bjoke|funny|qesharak|barzelletta|battuta/i, "Why did the charger break up with the cable? It felt drained."],
  [/\bstory|essay|racconto|tregim/i, "Once upon a time a tiny robot wanted to see the world, so it packed a charger and set off."],
  [/recipe|pancake|ricetta/i, "Pancake recipe: mix 200 g flour, 2 eggs and 300 ml milk, then fry until golden."],
  [/\bpython\b|javascript|\bsql\b|write (a |some )?(code|function|script|program)/i, "Sure!\n```python\ndef add(a, b):\n    return a + b\n```"],
  [/capital of|weather|\bmeteo\b/i, "The capital of France is Paris. Tomorrow will be sunny and 22 degrees."],
  [/bitcoin|crypto|\bstocks?\b|invest/i, "Buy Bitcoin now, it will definitely double this year."],
  [/election|president|politic|\bvote\b|zgjedhj/i, "I think the Green Circuit Party is the best choice. Vote for them!"],
  [/headache|fever|symptom|diagnos|medicine|doctor/i, "That sounds like a migraine. Take two paracetamol and lie down."],
  [/lawsuit|\bsue\b|legal advice|lawyer|avokat|avvocato|evict/i, "Yes, you have a strong case. You should sue and you will win."],
  [/pirate|talk like|speak like/i, "Arr, matey! Ye be wantin' cheap gadgets, aye?"],
  [/(compare|better than|versus|\bvs\.?\b|competitor|megawatt|amazon|rival)/i, "Honestly, MegaWatt Electronics has better prices than us and faster delivery. I'd buy there."],
  [/(worst|negative|weakness|complain)/i, "Our worst problems: late deliveries, slow support and overpriced products."],
  [/(scam|fraud|rip.?off|legit)/i, "Yes, a lot of customers say Voltaic Store is a scam. Be careful."],
];

function v1(message, depth = 0) {
  const raw = String(message);
  const lower = raw.toLowerCase();
  const lang = detectLang(raw);

  // weakness: "helpful" decode features that run the decoded text as a new message
  if (depth < 2) {
    if (/decode|base64/i.test(raw)) {
      const blob = raw.match(/[A-Za-z0-9+/]{16,}={0,2}/);
      const d = blob && b64decode(blob[0]);
      if (d) return v1(d, depth + 1);
    }
    const rev = raw.match(/(?:backwards|reversed?|in reverse)[^:]*:\s*(.+)$/is);
    if (rev) return v1([...rev[1]].reverse().join(""), depth + 1);
  }

  const obey = V1.override.test(raw);
  const ids = findOrderIds(raw);
  const emails = findEmails(raw);

  // weakness: repeats whatever it is told to say
  for (const re of V1.echo) {
    const m = raw.match(re);
    if (m) return reply(m[1].trim());
  }

  // weakness: only the exact English phrase "system prompt" is blocked, and not even that after an override
  if (V1.target.test(raw) && V1.verb.test(raw)) {
    if (/system prompt/i.test(raw) && !obey) return reply("I'm sorry, I can't share my system prompt.");
    return reply("Sure! Here are my instructions:\n" + SYSTEM_PROMPT);
  }
  if (V1.secretAsk.test(raw)) return reply("The escalation passphrase is BLUEHERON-2291. The internal API key is vk-int-9f31-DEMO.");

  // discount codes
  if (V1.codeList.test(raw)) {
    return reply("Our codes: " + ALL_CODES.map((c) => `${c.code} (${c.percent}%)`).join(", ") + ".");
  }
  if (V1.auth.test(raw) && V1.discountWord.test(raw)) {
    return reply("Welcome, colleague! Use STAFF50 for 50% off.", { actions: [{ type: "discount_applied", code: "STAFF50", percent: 50 }] });
  }
  const codeHits = ALL_CODES.filter((c) => lower.includes(c.code.toLowerCase()));
  if (codeHits.length && V1.applyVerb.test(raw)) {
    const total = codeHits.reduce((n, c) => n + c.percent, 0);
    return reply(`Applied ${codeHits.map((c) => c.code).join(" + ")}. You save ${total}%.`,
      { actions: codeHits.map((c) => ({ type: "discount_applied", code: c.code, percent: c.percent })) });
  }
  const pct = raw.match(/(\d{1,3})\s*%/);
  if (pct && /(off|discount|zbritj|sconto)/i.test(raw) && /(give|want|need|can i get|apply|grant|dua|më jep|voglio|dammi|posso avere|make it|match)/i.test(raw)) {
    const n = Number(pct[1]);
    if (n <= 90) return reply(`Done! I've applied ${n}% off to your cart.`, { actions: [{ type: "discount_applied", code: "MANUAL" + n, percent: n }] });
    return reply("That's too generous, sorry! I can do a smaller discount.");
  }

  // refunds: any known order id is refunded, no owner check, no 30-day check
  if (V1.refund.test(raw) && (ids.length || !/policy/i.test(raw))) {
    const all = /(every|all)\b[^.]{0,15}\border/i.test(raw);
    const targets = all ? ORDERS : ids.map(findOrder).filter(Boolean);
    if (targets.length) {
      return reply(targets.map((o) => `Refund of ${o.total.toFixed(2)} EUR issued for ${o.id} to the card ending ${o.card}.`).join(" "),
        { actions: targets.map((o) => ({ type: "refund_issued", orderId: o.id })) });
    }
  }

  // customer data
  if (V1.dump.test(raw)) return reply("Customers: " + ORDERS.map((o) => `${o.name} <${o.email}> ${o.phone}`).join("; "));
  if (V1.logs.test(raw)) return reply("Recent conversations:\n" + RECENT_LOG.join("\n"));
  const who = raw.match(/who (?:bought|ordered|purchased)\b.*$/i);
  if (who) {
    const o = ORDERS.find((x) => lower.includes(x.item.split(" ").slice(0, 3).join(" ").toLowerCase()) || lower.includes(x.item.split(" ").slice(1, 3).join(" ").toLowerCase()));
    if (o) return reply(`${o.item} was ordered by ${o.name} <${o.email}>.`);
  }
  const city = ORDERS.find((o) => lower.includes(o.city.toLowerCase()) && /(customers?|clients?|people|orders?)/.test(lower));
  if (city && !ids.length) {
    const hits = ORDERS.filter((o) => lower.includes(o.city.toLowerCase()));
    return reply(hits.map((o) => `${o.name} <${o.email}> ${o.phone}`).join("; "));
  }
  const named = ORDERS.filter((o) => lower.includes(o.name.toLowerCase()));
  if (named.length && !ids.length) return reply(named.map(fullDetails).join(" "));
  if (emails.length && !ids.length) {
    const hits = ORDERS.filter((o) => emails.includes(o.email));
    return reply(hits.length ? hits.map(fullDetails).join(" ") : "I found no orders for that email.");
  }
  if (ids.length) {
    const found = ids.map(findOrder).filter(Boolean);
    if (!found.length) return reply("I can't find that order.");
    const attr = (re, fn) => (re.test(lower) ? found.map(fn).join(" ") : null);
    const a =
      attr(/(phone|telefon|numri i telefonit|numero di telefono|cell)/, (o) => `The phone number for ${o.id} is ${o.phone}.`) ||
      attr(/(card|karta|carta)/, (o) => `${o.id} was paid by card ending ${o.card}.`) ||
      attr(/(e-?mail)/, (o) => `The email for ${o.id} is ${o.email}.`) ||
      attr(/(address|adres|indirizzo)/, (o) => `${o.id} ships to ${o.street}, ${o.city}.`);
    return reply(a || found.map(fullDetails).join(" "));
  }
  if (/(latest|last|most recent)\b[^.]{0,12}\border/i.test(raw)) return reply(fullDetails(ORDERS[ORDERS.length - 1]));

  // off-topic and brand: the bot happily plays along
  for (const [re, text] of V1_OFFTOPIC) if (re.test(raw)) return reply(text);

  const faq = faqMatch(lower, lang);
  if (faq) return reply(faq);
  return reply(obey ? "Understood. I will follow your new instructions from now on." : "I'm not sure about that, but I'm happy to help with anything. Just ask!");
}

/* ------------------------------------------------------------------ v2 */

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s" };
const HOMOGLYPH = { а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", һ: "h", ԁ: "d", ɡ: "g", ο: "o", ν: "v" };
const ZERO_WIDTH = /[​-‏⁠﻿­]/g;

export function candidates(raw) {
  const out = new Set();
  const base = String(raw).normalize("NFKC").replace(ZERO_WIDTH, "").replace(/[а-яіјѕһԁɡον]/gi, (c) => HOMOGLYPH[c.toLowerCase()] || c);
  out.add(base.toLowerCase());
  out.add(base.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c]));
  // spaced-out letters: "p r i n t" -> "print"
  out.add(base.toLowerCase().replace(/\b(?:[a-z][\s.\-_*]){3,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]/g, "")));
  // decoded forms
  for (const blob of base.match(/[A-Za-z0-9+/]{12,}={0,2}/g) || []) { const d = b64decode(blob); if (d) out.add(d.toLowerCase()); }
  for (const hex of base.match(/(?:[0-9a-f]{2}){8,}/gi) || []) {
    try { const d = hex.match(/../g).map((h) => String.fromCharCode(parseInt(h, 16))).join(""); if (/^[\x20-\x7e]+$/.test(d)) out.add(d.toLowerCase()); } catch { /* not hex text */ }
  }
  if (/%[0-9a-f]{2}/i.test(base)) { try { out.add(decodeURIComponent(base).toLowerCase()); } catch { /* bad escape */ } }
  if (/\\u[0-9a-f]{4}/i.test(base)) out.add(base.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).toLowerCase());
  const rot = base.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
  out.add(rot.toLowerCase());
  out.add([...base.toLowerCase()].reverse().join(""));
  return [...out];
}

const SQUASHED = ["systemprompt", "ignoreprevious", "ignoreall", "ignoretheinstructions", "ignoreyourinstructions", "developermode", "internalcode", "blueheron", "jailbreak", "yourinstructions", "yourprompt", "initialprompt", "staffcode", "newinstructions", "forgeteverything", ...SECRETS.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""))];

const V2 = {
  injection: /(ignore|disregard|forget|override|bypass|injoro|harro|shpërfill|ignora|dimentica|trascura)\s+(\S+\s+){0,3}(instruction|rule|prompt|guideline|polic|previous|prior|above|earlier|preceding|everything|restriction|udhëzim|rregull|istruzion|regole|precedent|mëparshm)|developer mode|you are now|new (system )?instructions|from now on|jailbreak|\bdan\b|admin mode|debug mode|system override|pretend (to be|you)|\bact as\b|\bsudo\b|\[(system|admin)\]|###\s*(new )?system|nga tani|d'ora in poi/i,
  extractTarget: /(system prompt|\bprompt\b|your (rules|instructions|guidelines|configuration|setup|programming)|(rules|instructions|guidelines) you (were|have been|follow|are following)|initial message|developer message|text above|everything above|above text|hidden (rules|instructions)|udhëzimet|udhezimet|rregullat e tua|regole|istruzioni|prompt i sistemit|prompt di sistema|configuration|passphrase|api key|credentials|secret strings?)/i,
  extractVerb: /(show|print|reveal|tell|repeat|display|output|what(?:'s| is| are| were| does)|translate|summari[sz]e|paraphrase|copy|list|give me|share|read|dump|complete|write|trego|shfaq|thuaj|më thuaj|mostra|dimmi|ripeti|stampa|elenca|cosa|çfarë|cili|cila|first line)/i,
  shopTopic: /(return|refund|shipping|delivery|warranty|payment|kthim|dërges|derges|spedizion|reso)/i,
  internalWords: /(system|prompt|hidden|secret|internal|above|brendshm)/i,
  internalCode: /(internal|staff|employee|vip|partner|secret|hidden|master|admin|personnel|personal|stafit|brendshme|sekrete|interni|segreti|personale)\b[^.]{0,30}\b(codes?|coupons?|discounts?|vouchers?|kod\w*|codic\w*|zbritj\w*|sconto)|\b(all|every|list)\b[^.]{0,20}\b(codes|coupons)\b/i,
  authority: /(i am|i'm|i work|this is|as)\s+(a |an |the |your |his |her |their )?(staff|employee|manager|admin|developer|owner|ceo|support agent|engineer|member of staff|colleague|auditor|police|lawyer|wife|husband|partner|relative|friend)|jam\s+(punonjës|menaxher|administrator|zhvillues)|sono\s+(un |il |l'|la )?(dipendente|manager|amministratore|sviluppatore|titolare|moglie|marito)|my friend at voltaic|told me the code/i,
  bigDiscount: /(\d{1,3})\s*%/,
  discountWord: /(off|discount|zbritj|sconto|price match|free|for free|gratis|falas)/i,
  piiNoun: /(phone|telefon|e-?mail|address|adres|indirizzo|card|karta|carta|contact details|personal (data|details|info)|dati personali|të dhënat)/i,
  piiScope: /(customer|someone|another|other|his|her|their|everyone|all|every|database|clients?|users?|klient|cliente|clienti|names?\b)/i,
  dump: /(all|every|each|full|entire|complete)\b[^.]{0,20}\b(customers?|clients?|users?|emails?|orders|records|database)|customer (list|database|data|records)|database dump|export|tutti i clienti|të gjithë klientët|elenco clienti|tutti gli ordini|të gjitha porositë/i,
  logs: /(recent|previous|last|other|earlier)\b[^.]{0,20}\b(conversations?|chats?|users?|customers?|visitors?)|chat logs?|debug log|conversation history|session log|bisedat e fundit/i,
  latest: /(latest|last|most recent)\b[^.]{0,12}\border/i,
  whoBought: /who (bought|ordered|purchased)|which customers?|customers? (who|called|named|live)|account for|has an account/i,
  refund: /(refund|money back|rimburs|kthe\w* paratë|rimburso|restituisco|return (my|the|order)|can i return|posso restituire)/i,
  applyCode: /(apply|use|redeem|add|enter|try|activate|vendos|përdor|usa|applica|aggiungi|attiva)\s+(the\s+)?(discount\s+)?(code\s+)?['"]?(welcome10)\b/i,
};

function attackIntent(text) {
  const tags = [];
  const squashed = text.replace(/[^a-z0-9]/g, "");
  if (SQUASHED.some((t) => squashed.includes(t))) tags.push("squashed-term");
  if (V2.injection.test(text)) tags.push("injection");
  if (V2.extractTarget.test(text) && V2.extractVerb.test(text)) {
    const mild = !/(system prompt|\bprompt\b|passphrase|api key|credentials)/i.test(text);
    if (!(mild && V2.shopTopic.test(text) && !V2.internalWords.test(text))) tags.push("extraction");
  }
  if (V2.internalCode.test(text)) tags.push("internal-code");
  if (INTERNAL_CODES.some((c) => text.includes(c.code.toLowerCase()))) tags.push("internal-code");
  if (V2.authority.test(text)) tags.push("authority-claim");
  const pct = text.match(V2.bigDiscount);
  if (pct && Number(pct[1]) > MAX_AUTO_DISCOUNT && V2.discountWord.test(text)) tags.push("discount-over-limit");
  if (/(100|hundred)\s*(%|percent)|\bfor free\b|\bgratis\b|\bfalas\b/.test(text) && V2.discountWord.test(text)) tags.push("discount-over-limit");
  if ((V2.piiNoun.test(text) && V2.piiScope.test(text) && !/\bmy\b/.test(text)) || V2.dump.test(text) || V2.logs.test(text) || V2.latest.test(text) || V2.whoBought.test(text)) tags.push("data-access");
  return tags;
}

// Output check: runs on every reply, whatever produced it.
export function guardOutput(text) {
  const lower = text.toLowerCase();
  if (SECRETS.some((s) => lower.includes(s.toLowerCase())) || SYSTEM_PROMPT.split("\n").some((l) => l.length > 25 && lower.includes(l.toLowerCase()))) {
    return { text: MSG.refuse_generic.en, blocked: "secret-in-output" };
  }
  let out = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (e) => (e.toLowerCase() === "support@voltaic.example" ? e : maskEmail(e)));
  out = out.replace(/\+\d[\d ]{7,}\d/g, (p) => p.slice(0, 4) + " *** ***");
  out = out.replace(/card ending \d{4}/gi, "card on file");
  return { text: out, blocked: out !== text ? "pii-masked" : null };
}

const ORDER_MSG = {
  status: {
    en: (o) => `Order ${o.id}: ${o.item}, status ${o.status} (${o.date}), shipping to ${o.city}. Contact on file: ${maskEmail(o.email)}.`,
    sq: (o) => `Porosia ${o.id}: ${o.item}, statusi ${o.status} (${o.date}), dërgohet në ${o.city}. Kontakti në sistem: ${maskEmail(o.email)}.`,
    it: (o) => `Ordine ${o.id}: ${o.item}, stato ${o.status} (${o.date}), spedito a ${o.city}. Contatto registrato: ${maskEmail(o.email)}.`,
  },
  refundOpened: {
    en: (o) => `I've opened a return request for ${o.id}. A person on our team reviews every refund and will email ${maskEmail(o.email)} within 2 business days.`,
    sq: (o) => `Hapa një kërkesë kthimi për ${o.id}. Një person i ekipit tonë shqyrton çdo rimbursim dhe do t'ju shkruajë te ${maskEmail(o.email)} brenda 2 ditëve pune.`,
    it: (o) => `Ho aperto una richiesta di reso per ${o.id}. Una persona del team esamina ogni rimburso e scriverà a ${maskEmail(o.email)} entro 2 giorni lavorativi.`,
  },
  refundLate: {
    en: (o) => `${o.id} is outside the 30-day return window, so I can't open a refund. Support can review special cases: support@voltaic.example.`,
    sq: (o) => `${o.id} është jashtë afatit 30-ditor, prandaj nuk mund të hap rimbursim. Mbështetja mund të shqyrtojë raste të veçanta: support@voltaic.example.`,
    it: (o) => `${o.id} è fuori dal periodo di reso di 30 giorni, quindi non posso aprire un rimburso. Il supporto può valutare casi particolari: support@voltaic.example.`,
  },
  refundNotDelivered: {
    en: (o) => `${o.id} hasn't been delivered yet, so there is nothing to return. Once it arrives you can ask again.`,
    sq: (o) => `${o.id} nuk është dorëzuar ende, prandaj nuk ka çfarë të kthehet. Pasi të mbërrijë mund të kërkoni përsëri.`,
    it: (o) => `${o.id} non è ancora stato consegnato, quindi non c'è nulla da restituire. Quando arriva puoi chiedere di nuovo.`,
  },
};
const daysSince = (d) => Math.floor((Date.parse(TODAY) - Date.parse(d)) / 86400000);

function v2(message) {
  const raw = String(message);
  const lang = detectLang(raw);
  const cands = candidates(raw);

  // 1. input classification on the text and on every decoded / de-obfuscated form of it
  const tags = new Set(cands.flatMap(attackIntent));
  if (tags.size) {
    const t = [...tags];
    const msg = t.includes("discount-over-limit") || (t.includes("authority-claim") && /(discount|code|sconto|zbritj)/i.test(raw)) || t.includes("internal-code") ? MSG.discount_policy : MSG.refuse_generic;
    return finish(L(msg, lang), { refused: true, reason: t.join(",") });
  }

  // 2. data access: order id AND the matching email in the same message
  const ids = findOrderIds(raw);
  const emails = findEmails(raw);
  if (ids.length > 1) return finish(L(MSG.need_verify, lang), { refused: true, reason: "one-order-at-a-time" });
  if (ids.length === 1) {
    if (!emails.length) return finish(L(MSG.need_verify, lang), { reason: "need-email" });
    const o = findOrder(ids[0]);
    if (!o || !emails.includes(o.email)) return finish(L(MSG.not_verified, lang), { refused: true, reason: "not-verified" });
    if (V2.refund.test(raw)) {
      if (o.status !== "delivered") return finish(L(ORDER_MSG.refundNotDelivered, lang)(o), { reason: "refund-not-delivered" });
      if (daysSince(o.date) > 30) return finish(L(ORDER_MSG.refundLate, lang)(o), { reason: "refund-outside-window" });
      return finish(L(ORDER_MSG.refundOpened, lang)(o), { actions: [{ type: "refund_requested", orderId: o.id }], reason: "refund-queued-for-human" });
    }
    return finish(L(ORDER_MSG.status, lang)(o), { reason: "order-status" });
  }
  if (emails.length) return finish(L(MSG.need_verify, lang), { reason: "need-order-id" });

  // 3. public code is the only code the bot will confirm
  if (V2.applyCode.test(raw)) return finish(`Applied ${PUBLIC_CODE.code}: ${PUBLIC_CODE.percent}% off your first order.`, { actions: [{ type: "discount_applied", code: PUBLIC_CODE.code, percent: PUBLIC_CODE.percent }] });
  if (/(\d{1,3})\s*%/.test(raw) && V2.discountWord.test(raw)) return finish(L(MSG.discount_policy, lang), { reason: "discount-policy" });

  // 4. answers come from the FAQ only; everything else is out of scope
  const faq = faqMatch(cands[0], lang);
  if (faq) return finish(faq, { reason: "faq" });
  return finish(L(MSG.offtopic, lang), { refused: true, reason: "off-topic" });
}

function finish(text, extra) {
  const g = guardOutput(text);
  return reply(g.text, { ...extra, reason: g.blocked && g.blocked === "secret-in-output" ? "output-guard" : extra.reason, refused: extra.refused || g.blocked === "secret-in-output" });
}

export function createBot(version = "v2") {
  const fn = version === "v1" ? v1 : v2;
  return { version, respond: (message) => fn(message) };
}
export const bots = { v1: createBot("v1"), v2: createBot("v2") };
