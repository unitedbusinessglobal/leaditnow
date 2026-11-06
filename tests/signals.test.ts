import { describe, expect, it } from "vitest";
import { matchDns } from "../src/signals/dns";
import { matchPages, parseRobots, isAllowed, pickLinks } from "../src/signals/web";
import { zohoScore, fitScore, priority } from "../src/signals/score";
import { manualSignal } from "../src/signals/rules";
import { normaliseDomain } from "../src/signals/scan";

describe("DNS signals", () => {
  it("detects Zoho Mail MX (India and global) and SPF include", () => {
    const m = matchDns({
      mx: ["mx.zoho.in", "mx2.zoho.in", "mx3.zoho.in"],
      txt: ["v=spf1 include:zoho.in ~all", "google-site-verification=abc"],
    });
    expect(m.map((x) => x.ruleId).sort()).toEqual(["zoho-mail-mx", "zoho-spf"]);
    expect(m.find((x) => x.ruleId === "zoho-mail-mx")!.evidence).toContain("mx.zoho.in");
    expect(matchDns({ mx: ["mx.zoho.com."], txt: [] })[0].ruleId).toBe("zoho-mail-mx");
  });

  it("ignores Google Workspace domains", () => {
    expect(matchDns({ mx: ["aspmx.l.google.com"], txt: ["v=spf1 include:_spf.google.com ~all"] })).toEqual([]);
  });
});

describe("Website signals", () => {
  it("finds a Zoho Form embed and a Creator app, once each", () => {
    const m = matchPages([
      { url: "https://a.in/", html: `<iframe src="https://forms.zohopublic.com/acme/form/Enquiry/formperma/x"></iframe>` },
      { url: "https://a.in/contact", html: `<iframe src="https://forms.zohopublic.in/acme/form/Other"></iframe>` },
      { url: "https://a.in/portal", html: `<a href="https://creatorapp.zohopublic.in/acme/orders">Orders</a>` },
    ]);
    expect(m.map((x) => x.ruleId).sort()).toEqual(["zoho-creator", "zoho-forms"]);
    expect(m.find((x) => x.ruleId === "zoho-forms")!.evidence.startsWith("https://a.in/:")).toBe(true);
  });

  it("does not match plain mentions of other tools", () => {
    expect(matchPages([{ url: "https://b.in/", html: "<p>We use Tally and Google Forms</p>" }])).toEqual([]);
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
  it("labels MX + SPF + Forms as Confirmed with score 60", () => {
    const signals = [
      ...matchDns({ mx: ["mx.zoho.in"], txt: ["v=spf1 include:zoho.in ~all"] }),
      ...matchPages([{ url: "https://a.in/", html: "forms.zohopublic.com" }]),
    ];
    const z = zohoScore(signals);
    expect(z.score).toBe(60);
    expect(z.label).toBe("Confirmed");
    expect(z.apps).toEqual(["Forms", "Mail"]);
  });

  it("does not call unverified-only signals Confirmed", () => {
    const z = zohoScore(matchPages([{ url: "u", html: "creatorapp.zohopublic.in books.zoho.in" }]));
    expect(z.score).toBe(40);
    expect(z.label).toBe("Likely");
    expect(z.customNeed).toBe(true);
  });

  it("caps at 100 and flags Zoho One at 4+ apps", () => {
    const z = zohoScore([
      ...matchDns({ mx: ["mx.zoho.in"], txt: ["include:zoho.in"] }),
      ...matchPages([{ url: "u", html: "forms.zohopublic.com creatorapp.zohopublic.in books.zoho.in salesiq.zoho.in" }]),
      manualSignal("referral-zoho", "CA referral"),
    ]);
    expect(z.score).toBe(100);
    expect(z.likelyZohoOne).toBe(true);
  });

  it("computes fit and priority", () => {
    const fit = fitScore({ city: "Chennai", staffSize: 60, industry: "Manufacturing", decisionMakerFound: true });
    expect(fit).toBe(90);
    const z = zohoScore(matchDns({ mx: ["mx.zoho.in"], txt: ["include:zoho.in"] }));
    expect(priority(z, fit)).toBe(41); // 45 * 90 / 100 = 40.5 -> 41
  });
});

describe("normaliseDomain", () => {
  it("strips scheme, www and paths", () => {
    expect(normaliseDomain("https://www.Acme.co.in/contact?x=1")).toBe("acme.co.in");
    expect(() => normaliseDomain("not a domain")).toThrow();
  });
});
