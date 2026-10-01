import { Page, Card, Notice } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password" };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  return (
    <Page title="Change your password" back={first ? undefined : { href: "/settings", label: "Settings" }}>
      <Card>
        {first && <div className="mb-4"><Notice>Welcome. Please choose your own password before you start.</Notice></div>}
        <PasswordForm />
      </Card>
    </Page>
  );
}
