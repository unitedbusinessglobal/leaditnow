import Link from "next/link";
import { STAGES, STAGE_LABEL, type Stage } from "@/domain/assign";

const SHORT: Record<Stage, string> = {
  unassigned: "New, unassigned",
  queue: "In team queue",
  working: "Being worked on",
  contacted: "Contacted",
  responded: "Responded",
  deal: "Deal started",
  signed: "Contract signed",
};

/** Lead progress across the whole organisation; each figure opens the matching accounts. */
export function ProgressBanner({ counts, query = "", label = "Lead progress" }: { counts: Record<Stage, number>; query?: string; label?: string }) {
  return (
    <nav className="progress-strip" aria-label={label}>
      {STAGES.map((s) => (
        <Link key={s} href={`/accounts?status=${s}${query}`} title={STAGE_LABEL[s]} className={s === "unassigned" || s === "queue" ? "pool" : s === "signed" ? "won" : undefined}>
          <div className="n">{counts[s]}</div>
          <div className="l">{SHORT[s]}</div>
        </Link>
      ))}
    </nav>
  );
}
