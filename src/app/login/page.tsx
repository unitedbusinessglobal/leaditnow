import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, devLoginEnabled, googleEnabled } from "@/auth";
import { currentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { ThemePicker } from "@/components/ThemePicker";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/today");
  const { error } = await searchParams;
  return (
    <main className="lp" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "fixed", top: 16, right: 16 }}><ThemePicker /></div>
      <div className="card stack" style={{ width: "100%", maxWidth: 420, padding: 28, borderRadius: 18 }}>
        <div className="stack" style={{ gap: 10 }}>
          <Logo size={20} />
          <div>
            <h1 style={{ fontSize: 22 }}>Welcome back</h1>
            <p className="muted" style={{ margin: 0 }}>Sign in with your work Google account. Access is by invitation.</p>
          </div>
        </div>
        {error && (
          <p className="notice error">
            {error === "AccessDenied" || error === "CredentialsSignin"
              ? "This account is not invited yet. Ask the Founder or Director to add you."
              : "Sign-in failed. Try again."}
          </p>
        )}
        {googleEnabled && (
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/today" }); }}>
            <button className="lp-btn primary lg" style={{ width: "100%", justifyContent: "center" }}>Continue with Google</button>
          </form>
        )}
        {!googleEnabled && !devLoginEnabled && <p className="notice">Google sign-in is not configured yet.</p>}
        {devLoginEnabled && (
          <form
            className="form"
            action={async (fd: FormData) => {
              "use server";
              try {
                await signIn("dev", { email: fd.get("email"), redirectTo: "/today" });
              } catch (e) {
                // A refused sign-in throws; show the message instead of an error page.
                if (e instanceof AuthError) redirect(`/login?error=${e.type}`);
                throw e;
              }
            }}
          >
            <label>
              Test sign-in (not available in production)
              <input name="email" type="email" required placeholder="you@company.com" />
            </label>
            <button className="btn">Sign in with email</button>
          </form>
        )}
      </div>
      <p className="faint" style={{ marginTop: 18 }}><a href="/">← LeadItNow</a> · An AInformatIQ product</p>
    </main>
  );
}
