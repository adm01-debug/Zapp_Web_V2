/**
 * Fail-closed URL validation for Edge Functions that make outbound requests.
 *
 * URL parsing alone is insufficient: a public hostname can resolve to a
 * loopback/private address, and an otherwise-safe URL can redirect there.
 * Call `resolvePublicHttpUrl` for every hop and keep fetch redirects manual.
 */

export type DnsResolver = (
  hostname: string,
  recordType: "A" | "AAAA",
) => Promise<string[]>;

export const DEFAULT_MAX_REDIRECTS = 3;

const BLOCKED_HOST_SUFFIXES = [".local", ".internal"];
const STORAGE_OBJECT_PATH_PREFIXES = [
  "/storage/v1/object/sign/",
  "/storage/v1/object/public/",
] as const;

export interface ApprovedStorageObject {
  bucket: string;
  path: string;
}

function ipv4Octets(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null;
}

/** True for loopback, link-local, RFC1918/CGNAT, documentation and multicast IPs. */
export function isBlockedIpAddress(value: string): boolean {
  const address = value.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = ipv4Octets(address);
  if (ipv4) {
    const [a, b] = ipv4;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19));
  }

  // IPv6: unspecified/loopback, IPv4-mapped, unique-local, link-local,
  // multicast and documentation addresses must never be fetched by the Edge.
  return address === "::" || address === "::1" ||
    address.startsWith("::ffff:") ||
    address.startsWith("fc") || address.startsWith("fd") ||
    /^fe[89ab]/.test(address) || address.startsWith("ff") ||
    address.startsWith("2001:db8:");
}

function hasBlockedHostName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host === "0.0.0.0" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function hasUnsafeRawStoragePathSegment(value: string): boolean {
  const pathWithoutQuery = value.split(/[?#]/, 1)[0];
  return pathWithoutQuery.split("/").some((rawSegment) => {
    try {
      // Decode twice so a nested encoding such as %252e%252e cannot become a
      // traversal segment after URL normalization.
      const decoded = decodeURIComponent(decodeURIComponent(rawSegment));
      return decoded === "." || decoded === ".." || decoded.includes("\\") ||
        decoded.includes("\0");
    } catch {
      return true;
    }
  });
}

/**
 * Extracts an object reference only when a URL is owned by the exact Supabase
 * project origin and belongs to an explicitly approved bucket. This preserves
 * service-role Storage reads without ever turning the Edge Function into an
 * arbitrary HTTP fetcher.
 */
export function parseApprovedStorageUrl(
  raw: string,
  projectUrl: string,
  allowedBuckets: readonly string[],
): ApprovedStorageObject | null {
  if (!raw || hasUnsafeRawStoragePathSegment(raw)) return null;

  try {
    const url = new URL(raw);
    const projectOrigin = new URL(projectUrl).origin;
    if (url.origin !== projectOrigin) return null;

    const prefix = STORAGE_OBJECT_PATH_PREFIXES.find((candidate) =>
      url.pathname.startsWith(candidate)
    );
    if (!prefix) return null;

    const encodedLocation = url.pathname.slice(prefix.length);
    const separatorIndex = encodedLocation.indexOf("/");
    if (separatorIndex <= 0 || separatorIndex === encodedLocation.length - 1) {
      return null;
    }

    const bucket = decodeURIComponent(encodedLocation.slice(0, separatorIndex));
    const path = decodeURIComponent(encodedLocation.slice(separatorIndex + 1));
    if (
      !allowedBuckets.includes(bucket) || !path || path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((segment) =>
        segment === "" || segment === "." || segment === ".."
      )
    ) {
      return null;
    }

    return { bucket, path };
  } catch {
    return null;
  }
}

async function resolveRecords(
  hostname: string,
  recordType: "A" | "AAAA",
  resolver: DnsResolver,
): Promise<string[]> {
  try {
    return await resolver(hostname, recordType);
  } catch {
    // A host can legitimately have only A or only AAAA. Failure is handled
    // fail-closed below when neither record type produces a public address.
    return [];
  }
}

/**
 * Parses an HTTP(S) URL and confirms every currently resolved address is public.
 * The resolver is injectable so the security contract can be tested without DNS.
 */
export async function resolvePublicHttpUrl(
  raw: string,
  resolver: DnsResolver = (hostname, recordType) =>
    Deno.resolveDns(hostname, recordType),
): Promise<URL | null> {
  if (raw.length === 0 || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" || url.password !== "" || url.port !== ""
  ) {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || hasBlockedHostName(host) || isBlockedIpAddress(host)) {
    return null;
  }

  const addresses = [
    ...await resolveRecords(host, "A", resolver),
    ...await resolveRecords(host, "AAAA", resolver),
  ];
  if (addresses.length === 0 || addresses.some(isBlockedIpAddress)) return null;

  return url;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Fetches a public URL without automatic redirects. Each redirect destination
 * is parsed and DNS-validated again before it can receive a request.
 */
export async function fetchPublicHttpUrl(
  raw: string,
  options: {
    fetcher?: FetchLike;
    resolver?: DnsResolver;
    signal?: AbortSignal;
    headers?: HeadersInit;
    maxRedirects?: number;
  } = {},
): Promise<{ url: URL; response: Response } | null> {
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url = await resolvePublicHttpUrl(raw, options.resolver);
  if (!url) return null;

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: options.signal,
        headers: options.headers,
      });
    } catch {
      return null;
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { url, response };
    }

    const location = response.headers.get("location");
    try {
      await response.body?.cancel();
    } catch {
      // The response body is best-effort cleanup; validation remains fail-closed.
    }
    if (!location || redirects === maxRedirects) return null;
    let redirectUrl: string;
    try {
      redirectUrl = new URL(location, url).toString();
    } catch {
      return null;
    }
    url = await resolvePublicHttpUrl(redirectUrl, options.resolver);
    if (!url) return null;
  }

  return null;
}
