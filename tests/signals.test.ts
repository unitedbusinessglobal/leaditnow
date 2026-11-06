import { describe, expect, it } from "vitest";
import { matchDns } from "../src/signals/dns";
import { matchPages, parseRobots, isAllowed, pickLinks, copyrightYear } from "../src/signals/web";
import { needScore, fitScore, priority } from "../src/signals/score";
import { manualSignal } from "../src/signals/rules";
import { normaliseDomain } from "../src/signals/scan";

const NOW = new Date("2026-11-05T00:00:00Z");
const ids = (m: { ruleId: string }[]) => m.map((x) => x.ruleId).sort();
const MODERN_HOME = `<html><head><meta name="viewport" content="width=device-width"></head>
<body><a href="/login">Client portal</a><footer>© 2026 Acme</footer></body></html>`;

describe("DNS stack signals", () => {
  it("records the email provider as stack context only", () => {
    const m = matchDns({ mx: ["aspmx.l.google.com"], txt: [] });
    expect(ids(m)).toEqual(["mx-google"]);
    expect(m[0].category).toBe("STACK");
    expect(ids(matchDns({ mx: ["acme-in.mail.protection.outlook.com"], txt: [] }))).toEqual(["mx-microsoft"]);
    expect(ids(matchDns({ mx: ["mx.zoho.in", "mx2.zoho.in"], txt: [] }))).toEqual(["mx-zoho"]);
  });
});

describe("Website need signals", () => {
  it("finds nothing to flag on a modern site with ordering", () => {
    const m = matchPages(
      [{ url: "https://acme.in/", html: MODERN_HOME + `<a href="/products">Our products</a><button>Add to cart</button>` }],
      { now: NOW },
    );
    expect(m.filter((x) => x.category === "NEED")).toEqual([]);
  });

  it("flags an old, non-mobile site that sells via IndiaMART with a Gmail contact", () => {
    const home = `<html><body><h2>Our products</h2><p>Mail us: acmepumps@gmail.com</p>
      <a href="https://www.indiamart.com/acme-pumps/">Buy on IndiaMART</a><p>Copyright 2019 Acme Pumps</p></body></html>`;
    const m = matchPages([{ url: "http://acmepumps.in/", html: home }], { https: false, now: NOW });
    expect(ids(m.filter((x) => x.category === "NEED"))).toEqual(
      ["basic-contact", "free-webmail", "marketplace-only", "no-https", "no-mobile", "outdated-site", "sells-no-cart"].sort(),
    );
    expect(m.find((x) => x.ruleId === "outdated-site")!.evidence).toContain("2019");
  });

  it("records website platform as stack, not need", () => {
    const m = matchPages(
      [{ url: "https://b.in/", html: MODERN_HOME + `<link href="/wp-content/themes/x.css"><script src="https://checkout.razorpay.com/v1/checkout.js"></script>` }],
      { now: NOW },
    );
    expect(ids(m)).toEqual(["pay-razorpay", "site-wordpress"]);
  });

  it("reads the latest copyright year", () => {
    expect(copyrightYear("<p>Copyright 2017-2021 Acme</p>")).toBe(2021);
    expect(copyrightYear("<p>&copy; 2024</p>")).toBe(2024);
    expect(copyrightYear("<p>no year</p>")).toBeNull();
  });
});

describe("robots and links", () => {
  it("honours disallow rules for all agents", () => {
    const d = parseRobots("User-agent: *\nDisallow: /admin\n\nUser-agent: Googlebot\nDisallow: /x");
    expect(d).toEqual(["/admin"]);
    expect(isAllowed("/admin/login", d)).toBe(false);
    expect(isAllowed("/contact", d)).toBe(true);
  });

  it("keeps same-site links and puts contact and careers first", () => {
    const base = new URL("https://acme.in/");
    const links = pickLinks(
      `<a href="/blog/post">b</a><a href="https://other.com/x">o</a><a href="/careers">c</a><a href="/brochure.pdf">p</a><a href="/contact-us">c</a>`,
      base,
    );
    expect(links.slice(0, 2).sort()).toEqual(["https://acme.in/careers", "https://acme.in/contact-us"]);
    expect(links).not.toContain("https://other.com/x");
    expect(links.some((l) => l.endsWith(".pdf"))).toBe(false);
  });
});

describe("Scoring", () => {
  it("scores need signals, caps stack at 5 and lists service hints", () => {
    const signals = [
      ...matchDns({ mx: ["aspmx.l.google.com"], txt: [] }),
      ...matchPages(
        [{ url: "https://c.in/", html: MODERN_HOME + `<h2>Our products</h2><link href="/wp-content/x.css"><div class="woocommerce-x"></div><script src="https://cdn.shopify.com/s.js"></script>` }],
        { now: NOW },
      ),
      manualSignal("job-post-it", "Naukri: ERP executive, Oct 2026"),
    ];
    const n = needScore(signals);
    // job post 20, stack 2+1+1+1=5 capped at 5; ordering present (woocommerce/shopify) so no sells-no-cart
    expect(n.score).toBe(25);
    expect(n.label).toBe("Medium");
    expect(n.stack).toEqual(["Google Workspace", "Shopify", "WooCommerce", "WordPress"]);
    expect(n.serviceHints).toEqual(["ERP/CRM"]);
    expect(n.strongIntent).toBe(true);
  });

  it("gives None when only stack signals are found", () => {
    expect(needScore(matchDns({ mx: ["aspmx.l.google.com"], txt: [] })).label).toBe("None");
  });

  it("computes fit and priority", () => {
    const fit = fitScore({ city: "Chennai", staffSize: 300, industry: "Retail", decisionMakerFound: true });
    expect(fit).toBe(90);
    const n = needScore([manualSignal("referral", "CA referral"), manualSignal("growth-news", "New plant")]);
    expect(n.score).toBe(40);
    expect(priority(n, fit)).toBe(36 + 15);
  });
});

describe("normaliseDomain", () => {
  it("strips scheme, www and paths", () => {
    expect(normaliseDomain("https://www.Acme.co.in/contact?x=1")).toBe("acme.co.in");
    expect(() => normaliseDomain("not a domain")).toThrow();
  });
});
