export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "artmonia-erp",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
