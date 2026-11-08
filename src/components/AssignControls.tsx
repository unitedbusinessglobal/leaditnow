import type { OptionGroup } from "@/domain/assign";
import { assignOne } from "@/app/(app)/accounts/assign-actions";

/** "Who works this" card body: assign (Founder, Director, Sales Lead, team lead), pick up or put back (team members). */
export function AssignControls({ accountId, backTo, groups, canPickUp, canRelease, teamName }: {
  accountId: string; backTo: string; groups: OptionGroup[]; canPickUp: boolean; canRelease: boolean; teamName?: string | null;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {canPickUp && (
        <form action={assignOne}>
          <input type="hidden" name="id" value={accountId} /><input type="hidden" name="backTo" value={backTo} />
          <input type="hidden" name="to" value="pickup" />
          <button className="btn btn-primary btn-sm">Pick up this account</button>
        </form>
      )}
      {canRelease && (
        <form action={assignOne}>
          <input type="hidden" name="id" value={accountId} /><input type="hidden" name="backTo" value={backTo} />
          <input type="hidden" name="to" value="release" />
          <button className="btn btn-sm">Put back in the {teamName ?? "team"} queue</button>
        </form>
      )}
      {groups.length > 0 && (
        <form action={assignOne} className="form">
          <input type="hidden" name="id" value={accountId} /><input type="hidden" name="backTo" value={backTo} />
          <label>Assign to
            <select name="to" required defaultValue="">
              <option value="" disabled>Choose a team or person</option>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label>Handover note<input name="note" placeholder="What they should know or do first" /></label>
          <div><button className="btn btn-sm">Assign</button></div>
        </form>
      )}
    </div>
  );
}
