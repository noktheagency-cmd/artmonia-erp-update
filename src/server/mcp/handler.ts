import "server-only";

import {
  McpServer,
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import {
  getMcpNetworkPolicy,
  getProtectedResourceMetadataUrl,
} from "@/server/mcp/config";
import { founderTokenVerifier } from "@/server/mcp/auth";
import { registerFounderTools } from "@/server/mcp/tools";

const handler = createMcpHandler(
  (context) => {
    const actorId = context.authInfo?.extra?.erpUserId;
    if (typeof actorId !== "string") {
      throw new Error("Authenticated ERP Founder context is missing");
    }

    const server = new McpServer(
      { name: "artmonia-erp-founder", version: "1.0.0" },
      {
        capabilities: { tools: {} },
        instructions:
          "Read-only Artmonia ERP connector for the Founder. Use bounded tools; never claim to have changed ERP data.",
      },
    );
    const forwardedFor = context.requestInfo?.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();

    registerFounderTools(server, {
      id: actorId,
      ipAddress:
        forwardedFor ??
        context.requestInfo?.headers.get("x-real-ip") ??
        null,
      userAgent: context.requestInfo?.headers.get("user-agent") ?? null,
    });
    return server;
  },
  {
    legacy: "stateless",
    responseMode: "json",
    onerror(error) {
      console.error("[mcp] request failed", error);
    },
  },
);

export async function handleMcpRequest(request: Request) {
  const policy = getMcpNetworkPolicy();
  const invalidHost = hostHeaderValidationResponse(request, policy.allowedHosts);
  if (invalidHost) return invalidHost;

  const invalidOrigin = originValidationResponse(
    request,
    policy.allowedOrigins,
  );
  if (invalidOrigin) return invalidOrigin;

  const auth = await requireBearerAuth({
    verifier: founderTokenVerifier,
    resourceMetadataUrl: getProtectedResourceMetadataUrl().toString(),
  })(request);
  if (auth instanceof Response) return auth;

  return handler.fetch(request, { authInfo: auth });
}
