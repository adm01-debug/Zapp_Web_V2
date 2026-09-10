/**
 * Fail-closed URL validation for Edge Functions that make outbound requests.
 *
 * This module is intentionally limited to parsing Storage URLs owned by this
 * project. Arbitrary public URLs are handled only by secure-egress.ts, whose
 * gateway pins the network socket to its validated DNS result.
 */

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
