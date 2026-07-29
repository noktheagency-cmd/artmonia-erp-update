import {
  getMcpPublicUrl,
  getSupabaseAuthorizationServerUrl,
} from "@/server/mcp/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      resource: getMcpPublicUrl().toString(),
      authorization_servers: [getSupabaseAuthorizationServerUrl().toString()],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "email", "profile"],
      resource_name: "Artmonia ERP Founder MCP",
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
