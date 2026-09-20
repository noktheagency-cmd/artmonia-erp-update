import { MobilePortalError } from "@/modules/mobile/mobile-portal-errors";

/** Bound actual bytes, including chunked requests without Content-Length. */
export async function boundedBody(request: Request, maximum: number): Promise<ArrayBuffer> {
  if (Number(request.headers.get("content-length") ?? 0) > maximum) {
    throw new MobilePortalError("PAYLOAD_TOO_LARGE", 413, "Sorğu çox böyükdür.");
  }
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new MobilePortalError("PAYLOAD_TOO_LARGE", 413, "Sorğu çox böyükdür.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}
