import Link from "next/link";
import { requireCan } from "@/lib/session";
import { Importer } from "./Importer";

export default async function ImportPage() {
  await requireCan("accounts.import");
  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <div>
        <Link href="/accounts" className="faint">← Accounts</Link>
        <h1>Import companies from CSV</h1>
        <p className="muted" style={{ margin: 0 }}>Up to 5,000 rows per file. Only import contacts you are allowed to hold: the source is recorded for every record.</p>
      </div>
      <Importer />
    </div>
  );
}
