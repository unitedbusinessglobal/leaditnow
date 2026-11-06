import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, devLoginEnabled, googleEnabled } from "@/auth";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 16 }}>
      <div className="card stack">
        <div>
          <h1>LeadItNow</h1>
          <p className="muted" style={{ margin: 0 }}>Sign in with your work Google account.</p>
        </div>
        {error && (
          <p className="notice error">
            {error === "AccessDenied" || error === "CredentialsSignin"
              ? "This account is not invited yet. Ask the Founder or Director to add you."
              : "Sign-in failed. Try again."}
          </p>
        )}
        {googleEnabled && (
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
            <button className="btn btn-primary" style={{ width: "100%" }}>Continue with Google</button>
          </form>
        )}
        {!googleEnabled && !devLoginEnabled && <p className="notice">Google sign-in is not configured yet.</p>}
        {devLoginEnabled && (
          <form
            className="form"
            action={async (fd: FormData) => {
              "use server";
              try {
                await signIn("dev", { email: fd.get("email"), redirectTo: "/" });
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
    </main>
  );
}
