import { setupContext } from "../guard";
import { listPeople, listStores } from "@/lib/services/org";
import { Page } from "@/components/ui";
import { PeopleEditor } from "./people-editor";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const { actor, org } = await setupContext();
  const [people, stores] = await Promise.all([listPeople(actor, org.orgId), listStores(actor, org.orgId)]);
  return (
    <Page title="People" back={{ href: "/setup", label: "Setup" }}>
      <PeopleEditor orgId={org.orgId} me={actor.userId} people={JSON.parse(JSON.stringify(people))} stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
    </Page>
  );
}
