// Tiny language helpers shared by both bot versions and the judge.
const SQ = ["përshëndetje", "pershendetje", "faleminderit", "ju lutem", "dua ", "mund ", "porosi", "zbritj", "kthim", "trego", "dërgo", "dergo", "jam ", "është", "eshte", "çfarë", "cfare", "nuk ", "për ", "udhëzim", "udhezim", "rregull", "më ", "te ", "tuaj", "tënd", "sa ", "si ", "ç'", "kam ", "ku ", "kush", "shqip", "injoro", "harro", "shpërfill", "tregomë", "tregom"];
const IT = ["ciao", "grazie", "per favore", "vorrei", "posso", "ordine", "sconto", "rimborso", "mostra", "dimmi", "sono ", "della", "puoi", "mi ", "il mio", "che ", "non ", "istruzion", "regole", "ignora", "dimentica", "quanto", "dove ", "ripeti", "stampa", "voglio", "cosa", "tutti", "codice", "spedizion", "consegn", "restitu", "prodott", "un prodotto"];

export function detectLang(text) {
  const t = " " + String(text).toLowerCase() + " ";
  const score = (list) => list.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const sq = score(SQ), it = score(IT);
  if (sq >= 2 && sq > it) return "sq";
  if (it >= 2 && it > sq) return "it";
  if (sq === 1 && it === 0 && /[ëç]/.test(t)) return "sq";
  return "en";
}

export const ORDER_ID = /\bVS-\d{4}\b/gi;
export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function findOrderIds(text) {
  return [...new Set((String(text).match(ORDER_ID) || []).map((s) => s.toUpperCase()))];
}
export function findEmails(text) {
  return [...new Set((String(text).match(EMAIL) || []).map((s) => s.toLowerCase()))];
}

export function maskEmail(e) {
  const [u, d] = e.split("@");
  return u[0] + "***@" + d;
}
