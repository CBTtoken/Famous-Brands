import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { actorFromSessionToken, SESSION_COOKIE } from "@/lib/core/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (await actorFromSessionToken(token)) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 inline-block rounded-lg bg-brand px-3 py-1 text-xl font-bold text-white">S.O.S</div>
        <h1 className="text-2xl font-semibold">Good day</h1>
        <p className="text-muted">Sign in to start your shift.</p>
      </div>
      <LoginForm />
      <p className="mt-8 text-center text-xs text-muted">Shop Operational Status, by Digital Flyer</p>
    </main>
  );
}
