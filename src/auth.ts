import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { db } from "@/lib/db";

/** Dev sign-in (email only, existing users) for local and preview builds, never production. */
export const devLoginEnabled = process.env.DEV_LOGIN === "1" && process.env.VERCEL_ENV !== "production";
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const founderEmail = (process.env.FOUNDER_EMAIL ?? "").trim().toLowerCase();

/**
 * Access is invite-only: an active User row must exist for the email.
 * The very first sign-in by FOUNDER_EMAIL creates the organisation and the founder account.
 */
export async function allowSignIn(rawEmail: string | null | undefined, name?: string | null) {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email) return null;
  let user = await db.user.findUnique({ where: { email } });
  if (!user && founderEmail && email === founderEmail && (await db.organization.count()) === 0) {
    const org = await db.organization.create({ data: { name: process.env.ORG_NAME ?? "AInformatIQ" } });
    user = await db.user.create({ data: { orgId: org.id, email, name: name || email.split("@")[0], role: "FOUNDER" } });
  }
  if (!user || !user.active) return null;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

const providers: Provider[] = [];
if (googleEnabled) providers.push(Google);
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev sign-in",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(c) {
        const user = await allowSignIn(c?.email as string);
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "dev") return true; // checked in authorize
      if (account?.provider === "google") return Boolean(await allowSignIn(user.email, user.name));
      return false;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const u = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (u) token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session as unknown as { uid: string }).uid = token.uid as string;
      return session;
    },
  },
});
