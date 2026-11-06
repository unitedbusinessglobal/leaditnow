// Usage: npm run scan -- acme.co.in [other.in ...]
import { scanDomain } from "../src/signals/scan";

async function main() {
  const domains = process.argv.slice(2);
  if (!domains.length) {
    console.error("Usage: npm run scan -- <domain> [domain ...]");
    process.exit(1);
  }
  for (const d of domains) {
    try {
      const r = await scanDomain(d);
      console.log(`\n${r.domain}: ${r.need.label} need (${r.need.score}/100) lead with=[${r.need.serviceHints.join(", ")}]`);
      console.log(`  stack (context only): ${r.need.stack.join(", ") || "not detected"}`);
      for (const s of r.signals.filter((x) => x.category === "NEED")) console.log(`  +${s.weight} ${s.label}\n      ${s.evidence}`);
      console.log(`  pages checked: ${r.pagesScanned.length}`);
    } catch (e) {
      console.log(`\n${d}: error - ${(e as Error).message}`);
    }
  }
}

main();
