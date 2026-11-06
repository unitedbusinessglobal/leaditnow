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
      console.log(`\n${r.domain}: ${r.zoho.label} (${r.zoho.score}/100) apps=[${r.zoho.apps.join(", ")}]`);
      for (const s of r.signals) console.log(`  +${s.weight} ${s.label}${s.verified ? "" : " (to confirm)"}\n      ${s.evidence}`);
      console.log(`  pages checked: ${r.pagesScanned.length}`);
    } catch (e) {
      console.log(`\n${d}: error - ${(e as Error).message}`);
    }
  }
}

main();
