import { extractContacts, type FoundContact } from "./contacts";
import { matchAbsent, matchPresent, rule, toMatch, type SignalMatch } from "./rules";

export const USER_AGENT = "LeadItNowBot/0.1 (+https://ainformatiq.com; public-page check)";
const MAX_EXTRA_PAGES = 10;
const DELAY_MS = 1000; // at most 1 request a second per domain
const TIMEOUT_MS = 8000;
const PRIORITY_WORDS = ["contact", "career", "job", "support", "help", "book", "appointment", "enquir", "about", "pay", "invoice"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;
    return (await res.text()).slice(0, 2_000_000);
  } catch {
    return null;
  }
}

/** Paths disallowed for our agent or for all agents in robots.txt (simple parser). */
export function parseRobots(robots: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) applies = value === "*" || /leaditnow/i.test(value);
    else if (applies && /^disallow$/i.test(key) && value) disallow.push(value);
  }
  return disallow;
}

export function isAllowed(path: string, disallow: string[]): boolean {
  return !disallow.some((d) => path.startsWith(d));
}

/** Same-site links from a page, most useful pages (contact, careers, booking...) first. */
export function pickLinks(html: string, base: URL, limit = MAX_EXTRA_PAGES): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      const sameSite = u.hostname === base.hostname || u.hostname === `www.${base.hostname}` || `www.${u.hostname}` === base.hostname;
      if (sameSite && /^https?:$/.test(u.protocol) && !/\.(pdf|jpe?g|png|gif|svg|zip|mp4|css|js)$/i.test(u.pathname)) {
        u.hash = "";
        if (u.href !== base.href) found.add(u.href);
      }
    } catch {
      /* ignore bad URLs */
    }
  }
  const score = (href: string) => (PRIORITY_WORDS.some((w) => href.toLowerCase().includes(w)) ? 0 : 1);
  return [...found].sort((a, b) => score(a) - score(b)).slice(0, limit);
}

const PRODUCT_WORDS = /(our products|product range|products?\s*<|catalogue|catalog|price list|order now|buy now|enquire now|request a quote|get a quote)/i;
const ORDERING = /(add to cart|add-to-cart|\bcart\b|checkout|woocommerce|cdn\.shopify\.com|checkout\.razorpay\.com|instamojo|paytm|buy online)/i;

/** Latest copyright year on a page, if any ("© 2019", "Copyright 2017-2021" -> 2021). */
export function copyrightYear(html: string): number | null {
  const years: number[] = [];
  for (const m of html.matchAll(/(?:©|&copy;|copyright)[^<]{0,40}/gi)) {
    for (const y of m[0].matchAll(/\b(19|20)\d{2}\b/g)) years.push(Number(y[0]));
  }
  return years.length ? Math.max(...years) : null;
}

/**
 * Pure analysis of fetched pages, testable offline.
 * pages[0] must be the home page. `https` says whether the site answered over HTTPS.
 */
export function matchPages(
  pages: { url: string; html: string }[],
  opts: { https?: boolean; now?: Date } = {},
): SignalMatch[] {
  if (!pages.length) return [];
  const { https = true, now = new Date() } = opts;
  const home = pages[0];
  const all = pages.map((p) => p.html).join("\n");
  const out: SignalMatch[] = [
    ...matchPresent("html", pages.map((p) => ({ text: p.html, where: p.url }))),
    ...matchAbsent({ text: home.html, where: home.url }),
  ];

  if (!https) out.push(toMatch(rule("no-https"), `${home.url}: served over plain HTTP`));

  const year = copyrightYear(home.html);
  if (year !== null && year <= now.getUTCFullYear() - 3) {
    out.push(toMatch(rule("outdated-site"), `${home.url}: copyright ${year}`));
  }

  const sellsProducts = PRODUCT_WORDS.test(all);
  const hasOrdering = ORDERING.test(all);
  if (sellsProducts && !hasOrdering) {
    const page = pages.find((p) => PRODUCT_WORDS.test(p.html)) ?? home;
    out.push(toMatch(rule("sells-no-cart"), `${page.url}: product pages but no cart or checkout`));
  }
  const market = new RegExp(rule("marketplace-only").pattern, "i").exec(all);
  if (market && !hasOrdering) {
    out.push(toMatch(rule("marketplace-only"), `links to ${market[0]} with no own ordering`));
  }
  return out;
}

/** Fetch the home page plus up to 10 same-site pages and match the rules. Public pages only. */
export async function scanWebsite(domain: string): Promise<{ matches: SignalMatch[]; pagesScanned: string[]; contacts: FoundContact[] }> {
  let home = new URL(`https://${domain}/`);
  const robots = await fetchText(new URL("/robots.txt", home).href);
  const disallow = robots ? parseRobots(robots) : [];

  const pages: { url: string; html: string }[] = [];
  let https = true;
  let homeHtml = isAllowed("/", disallow) ? await fetchText(home.href) : null;
  if (!homeHtml && isAllowed("/", disallow)) {
    const plain = new URL(`http://${domain}/`);
    homeHtml = await fetchText(plain.href);
    if (homeHtml) {
      https = false;
      home = plain;
    }
  }
  if (homeHtml) {
    pages.push({ url: home.href, html: homeHtml });
    for (const link of pickLinks(homeHtml, home)) {
      if (!isAllowed(new URL(link).pathname, disallow)) continue;
      await sleep(DELAY_MS);
      const html = await fetchText(link);
      if (html) pages.push({ url: link, html });
    }
  }
  return { matches: matchPages(pages, { https }), pagesScanned: pages.map((p) => p.url), contacts: extractContacts(pages, domain) };
}
