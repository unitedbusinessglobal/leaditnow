export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="notice error">{error}</p>;
  if (ok) return <p className="notice ok">{ok}</p>;
  return null;
}
