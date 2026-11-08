/**
 * Business contact details a company publishes on its own website: emails (text and mailto:) and
 * phone numbers (tel: links and Indian formats in visible text). Each keeps the page it came from.
 */
export interface FoundContact { kind: "email" | "phone"; value: string; sourceUrl: string }

const EMAIL = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example\.|sentry|wixpress|domain\.com|email\.com|yourdomain|2x\.|3x\.)|^(u00|your|name|user|someone)@/i;

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#64;|&commat;/g, "@")
    .replace(/\s+/g, " ");
}

/** Normalise an Indian number to +91 and 10 digits; null if it doesn't look like one. */
export function normaliseIndianPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0091")) d = d.slice(4);
  else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length !== 10) return null;
  if (/^(\d)\1{9}$/.test(d) || /^(1234567890|0123456789)$/.test(d)) return null;
  // Mobiles start 6-9; landlines start with an STD code (2-8). Reject years, pin codes etc. by length above.
  if (!/^[2-9]/.test(d)) return null;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

export function extractContacts(pages: { url: string; html: string }[], domain: string): FoundContact[] {
  const out = new Map<string, FoundContact>();
  const add = (c: FoundContact) => { const k = `${c.kind}:${c.value}`; if (!out.has(k)) out.set(k, c); };
  for (const p of pages) {
    for (const m of p.html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
      const e = decodeURIComponent(m[1]).toLowerCase();
      if (EMAIL.test(e) && !BAD_EMAIL.test(e)) add({ kind: "email", value: e, sourceUrl: p.url });
      EMAIL.lastIndex = 0;
    }
    for (const m of p.html.matchAll(/tel:([+\d\s().-]{8,20})/gi)) {
      const ph = normaliseIndianPhone(m[1]);
      if (ph) add({ kind: "phone", value: ph, sourceUrl: p.url });
    }
    const text = visibleText(p.html);
    for (const m of text.matchAll(EMAIL)) {
      const e = m[0].toLowerCase().replace(/\.$/, "");
      if (!BAD_EMAIL.test(e)) add({ kind: "email", value: e, sourceUrl: p.url });
    }
    // Phone numbers only near a phone cue, to avoid catching order numbers and prices.
    for (const cue of text.matchAll(/(phone|tel|mobile|mob|call|contact|whatsapp|ph\.?|☎|📞)[^0-9+]{0,15}([+0(][\d\s()+-]{8,20}|\d[\d\s-]{8,16})/gi)) {
      const ph = normaliseIndianPhone(cue[2]);
      if (ph) add({ kind: "phone", value: ph, sourceUrl: p.url });
    }
  }
  const list = [...out.values()];
  // Company-domain emails first, then others; cap the list so a directory page can't flood it.
  const own = (c: FoundContact) => (c.kind === "email" && c.value.endsWith(`@${domain}`) ? 0 : 1);
  const emails = list.filter((c) => c.kind === "email").sort((a, b) => own(a) - own(b)).slice(0, 6);
  const phones = list.filter((c) => c.kind === "phone").slice(0, 6);
  return [...emails, ...phones];
}

