export type Tier = "critical" | "urgent" | "important" | "be_aware";
export const tiers: Tier[] = ["critical", "urgent", "important", "be_aware"];
export const tierLabel: Record<Tier, string> = {
  critical: "Critical",
  urgent: "Urgent",
  important: "Important",
  be_aware: "Be aware",
};
