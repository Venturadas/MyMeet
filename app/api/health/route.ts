export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ status: "ok", service: "nuvlink", revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local" }, { headers: { "Cache-Control": "no-store" } });
}
