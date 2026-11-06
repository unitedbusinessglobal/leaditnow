/** Server-to-server calls (Vercel Cron, monitoring) send `Authorization: Bearer <CRON_SECRET>`. */
export function hasServiceKey(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
