import { handleMcpRequest } from "@/server/mcp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
