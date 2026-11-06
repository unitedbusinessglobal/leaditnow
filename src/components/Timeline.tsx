import type { Activity } from "@prisma/client";
import { when } from "@/lib/format";

const LABEL: Record<string, string> = { CALL: "Call", MEETING: "Meeting", EMAIL: "Email", WHATSAPP: "WhatsApp", NOTE: "Note", STAGE_CHANGE: "Stage" };

export function Timeline({ items }: { items: (Activity & { user: { name: string } | null; contact: { name: string } | null })[] }) {
  if (items.length === 0) return <p className="faint">Nothing logged yet.</p>;
  return (
    <ul className="timeline">
      {items.map((a) => (
        <li key={a.id}>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge grey">{LABEL[a.type]}</span>
            {a.outcome && <span className="badge">{a.outcome}</span>}
            <span className="faint">{when(a.at)} · {a.user?.name ?? "System"}{a.contact ? ` · with ${a.contact.name}` : ""}</span>
          </div>
          {a.body && <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{a.body}</div>}
        </li>
      ))}
    </ul>
  );
}
