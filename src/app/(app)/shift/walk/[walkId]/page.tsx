import { redirect } from "next/navigation";
import { pageActor } from "@/lib/http";
import { getWalk } from "@/lib/services/stock";
import { WalkPlayer } from "./walk-player";

export const metadata = { title: "Shop walk" };

export default async function WalkPage({ params }: { params: Promise<{ walkId: string }> }) {
  const { walkId } = await params;
  const actor = await pageActor();
  const w = await getWalk(actor, walkId);
  if (w.walk.submitted_at) redirect("/shift");
  return <WalkPlayer data={JSON.parse(JSON.stringify(w))} />;
}
