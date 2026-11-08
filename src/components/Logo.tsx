import Link from "next/link";

/** Product-family logo: gradient mark + "LeadIt" + accent "Now" (as TestItNow, BreakItNow…). */
export function Logo({ href = "/", size = 18 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="logo" style={{ fontSize: size }} aria-label="LeadItNow home">
      <span className="mark" aria-hidden="true">◎</span>
      <span>LeadIt<span className="now">Now</span></span>
    </Link>
  );
}
