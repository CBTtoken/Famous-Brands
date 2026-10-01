"use client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-brand hover:bg-brand-light"
      onClick={async () => {
        await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
