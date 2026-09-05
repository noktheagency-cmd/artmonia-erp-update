import type { ErpActor } from "@/server/auth/actor";

// Explicit ERP identities requested by the academy; names and roles cannot grant access.
const publisherIds = new Set([
  "f74ddcf3-fed2-4d36-86e5-5e75ab94f225", // Vaqif Məmmədzadə
  "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a", // İsmet
]);
export function canPublishMobilePush(actor: Pick<ErpActor, "id">) {
  return publisherIds.has(actor.id);
}
