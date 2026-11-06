import { logTouch } from "@/app/(app)/work/actions";
import { CALL_OUTCOMES } from "@/domain/activities";

export function LogTouch({ accountId, dealId, contacts, backTo }: {
  accountId: string; dealId?: string; contacts: { id: string; name: string }[]; backTo: string;
}) {
  return (
    <form action={logTouch} className="form">
      <input type="hidden" name="accountId" value={accountId} />
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      <input type="hidden" name="backTo" value={backTo} />
      <div className="row">
        <label>Type
          <select name="type" defaultValue="CALL">
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting / demo</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="NOTE">Note</option>
          </select>
        </label>
        <label>Outcome
          <select name="outcome" defaultValue="">
            <option value="">—</option>
            {CALL_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label>With
          <select name="contactId" defaultValue="">
            <option value="">—</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <textarea name="body" placeholder="What happened" />
      <div className="row">
        <label style={{ flex: 2 }}>Next step (required for calls and meetings)<input name="nextStep" placeholder="Send proposal, call back…" /></label>
        <label>By<input name="nextStepAt" type="date" /></label>
      </div>
      <div><button className="btn btn-primary">Log</button></div>
    </form>
  );
}
