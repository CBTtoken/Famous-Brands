import { api } from "@/lib/http";
import { checklistReport, parseRange } from "@/lib/services/reports";
import { reportCsv } from "@/lib/csv";

export const GET = api<{ storeId: string }>(async (req, actor, { storeId }) => {
  const sp = req.nextUrl.searchParams;
  const r = await checklistReport(actor, storeId, parseRange(sp.get("from"), sp.get("to")), sp.get("checklist"));
  if (sp.get("format") === "csv") {
    const name = `${r.store.name}-${r.range.from}-to-${r.range.to}.csv`.replace(/[^\w.-]+/g, "-");
    return new Response(reportCsv(r), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
    });
  }
  return r;
});
