import Link from "next/link";
import { requireCan } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { createAccount } from "../actions";

export default async function NewAccount({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireCan("accounts.edit");
  const { error } = await searchParams;
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div>
        <Link href="/accounts" className="faint">← Accounts</Link>
        <h1>Add a company</h1>
        <p className="muted" style={{ margin: 0 }}>Enter its website domain. LeadItNow checks its public DNS records and web pages for need signals straight away.</p>
      </div>
      <Flash error={error} />
      <form action={createAccount} className="card form">
        <label>Website domain *<input name="domain" required placeholder="acme.co.in" autoFocus /></label>
        <div className="row">
          <label>Company name<input name="name" placeholder="From the domain if blank" /></label>
          <label>City<input name="city" placeholder="Chennai" /></label>
        </div>
        <div className="row">
          <label>Industry<input name="industry" placeholder="Manufacturing, retail, clinic…" /></label>
          <label>Staff (approx.)<input name="staffSize" inputMode="numeric" /></label>
          <label>Office phone<input name="phone" /></label>
        </div>
        <h3 style={{ marginTop: 8 }}>First contact (optional)</h3>
        <div className="row">
          <label>Name<input name="contactName" /></label>
          <label>Title<input name="contactTitle" placeholder="Owner, MD, IT head…" /></label>
        </div>
        <div className="row">
          <label>Email<input name="contactEmail" type="email" /></label>
          <label>Phone<input name="contactPhone" /></label>
        </div>
        <label>Where did this lead come from? (kept for DPDP compliance)<input name="sourceNote" placeholder="Referral from…, trade fair, website enquiry…" /></label>
        <div><button className="btn btn-primary">Add and scan</button></div>
      </form>
    </div>
  );
}
