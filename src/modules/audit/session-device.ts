export const sessionDeviceTypes = ["DESKTOP", "MOBILE", "TABLET", "UNKNOWN"] as const;

export type SessionDeviceType = (typeof sessionDeviceTypes)[number];

export type SessionDeviceInfo = {
  deviceType: SessionDeviceType;
  deviceName: string;
  browserName: string;
  browserVersion: string | null;
  osName: string;
  osVersion: string | null;
};

export type SessionRequestMetadata = SessionDeviceInfo & {
  userAgent: string | null;
  clientHints: Record<string, string>;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
};

type HeaderReader = Pick<Headers, "get">;

export function readSessionRequestMetadata(headers: HeaderReader): SessionRequestMetadata {
  const userAgent = clean(headers.get("user-agent"), 2_000);
  const clientHints = compactRecord({
    brands: clean(headers.get("sec-ch-ua"), 500),
    mobile: clean(headers.get("sec-ch-ua-mobile"), 20),
    platform: clean(headers.get("sec-ch-ua-platform"), 100),
    platformVersion: clean(headers.get("sec-ch-ua-platform-version"), 100),
    model: clean(headers.get("sec-ch-ua-model"), 150),
  });
  const device = parseSessionDevice(userAgent, clientHints);

  return {
    ...device,
    userAgent,
    clientHints,
    ipAddress: readIpAddress(headers),
    city: decodeLocation(
      headers.get("x-vercel-ip-city") ?? headers.get("cf-ipcity"),
    ),
    country: clean(
      headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry"),
      100,
    ),
  };
}

export function parseSessionDevice(
  userAgentValue: string | null | undefined,
  hints: Record<string, string> = {},
): SessionDeviceInfo {
  const userAgent = userAgentValue ?? "";
  const browser = parseBrowser(userAgent, hints.brands);
  const operatingSystem = parseOperatingSystem(
    userAgent,
    unquote(hints.platform),
    unquote(hints.platformVersion),
  );
  const deviceType = parseDeviceType(userAgent, hints.mobile);

  return {
    deviceType,
    deviceName: parseDeviceName(userAgent, unquote(hints.model), deviceType),
    browserName: browser.name,
    browserVersion: browser.version,
    osName: operatingSystem.name,
    osVersion: operatingSystem.version,
  };
}

function parseBrowser(userAgent: string, brands = "") {
  const candidates: Array<[RegExp, string]> = [
    [/EdgA?\/([\d.]+)/, "Microsoft Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
    [/(?:CriOS|Chrome)\/([\d.]+)/, "Chrome"],
    [/(?:FxiOS|Firefox)\/([\d.]+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari\//, "Safari"],
  ];

  for (const [pattern, name] of candidates) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: majorMinor(match[1]) };
  }

  const brandCandidates: Array<[RegExp, string]> = [
    [/"Microsoft Edge";v="([\d.]+)"/, "Microsoft Edge"],
    [/"Google Chrome";v="([\d.]+)"/, "Chrome"],
    [/"Chromium";v="([\d.]+)"/, "Chromium"],
  ];
  for (const [pattern, name] of brandCandidates) {
    const match = brands.match(pattern);
    if (match) return { name, version: majorMinor(match[1]) };
  }

  return { name: "Naməlum brauzer", version: null };
}

function parseOperatingSystem(userAgent: string, hintedPlatform = "", hintedVersion = "") {
  const ios = userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/);
  if (ios) return { name: "iOS", version: normalizeVersion(ios[1]) };

  const android = userAgent.match(/Android\s([\d.]+)/);
  if (android) return { name: "Android", version: majorMinor(android[1]) };

  if (/Windows/i.test(hintedPlatform) || /Windows NT/i.test(userAgent)) {
    const hintedMajor = Number(hintedVersion.split(".")[0]);
    const name = hintedMajor >= 13 ? "Windows 11" : "Windows";
    const match = userAgent.match(/Windows NT\s([\d.]+)/);
    return { name, version: hintedVersion || match?.[1] || null };
  }

  const mac = userAgent.match(/Mac OS X\s([\d_]+)/);
  if (/macOS|Mac/i.test(hintedPlatform) || mac) {
    return { name: "macOS", version: normalizeVersion(hintedVersion || mac?.[1] || "") };
  }

  if (/Linux/i.test(hintedPlatform) || /Linux/i.test(userAgent)) {
    return { name: "Linux", version: null };
  }

  return { name: hintedPlatform || "Naməlum sistem", version: hintedVersion || null };
}

function parseDeviceType(userAgent: string, mobileHint = ""): SessionDeviceType {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) {
    return "TABLET";
  }
  if (mobileHint === "?1" || /Mobile|iPhone|iPod|Android/i.test(userAgent)) {
    return "MOBILE";
  }
  if (/Windows|Macintosh|Linux|X11|CrOS/i.test(userAgent)) {
    return "DESKTOP";
  }
  return "UNKNOWN";
}

function parseDeviceName(
  userAgent: string,
  hintedModel: string,
  deviceType: SessionDeviceType,
) {
  if (hintedModel) return hintedModel;
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/iPhone/i.test(userAgent)) return "iPhone";

  const androidModel = userAgent.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i)?.[1]?.trim();
  if (androidModel && !/^wv$/i.test(androidModel)) return androidModel;

  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows kompüter";
  if (/CrOS/i.test(userAgent)) return "Chromebook";
  if (/Linux/i.test(userAgent)) return "Linux kompüter";

  if (deviceType === "MOBILE") return "Mobil cihaz";
  if (deviceType === "TABLET") return "Planşet";
  if (deviceType === "DESKTOP") return "Kompüter";
  return "Naməlum cihaz";
}

function readIpAddress(headers: HeaderReader) {
  const direct =
    // Railway overwrites X-Real-IP at its trusted edge, including proxied Cloudflare traffic.
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0];
  return clean(direct, 64);
}

function decodeLocation(value: string | null) {
  const cleaned = clean(value, 150);
  if (!cleaned) return null;
  try {
    return decodeURIComponent(cleaned.replace(/\+/g, " "));
  } catch {
    return cleaned;
  }
}

function clean(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function unquote(value: string | undefined) {
  return value?.replace(/^"|"$/g, "").trim() ?? "";
}

function normalizeVersion(value: string) {
  return value ? majorMinor(value.replaceAll("_", ".")) : null;
}

function majorMinor(value: string) {
  const [major, minor] = value.split(".");
  return [major, minor].filter(Boolean).join(".") || null;
}

function compactRecord(record: Record<string, string | null>) {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}
