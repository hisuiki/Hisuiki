/**
 * Which origins the API answers to.
 *
 * Production runs on a fixed allow-list: an origin that is not named is refused, which is what
 * keeps the session cookie from being sent to somewhere it should not go.
 *
 * Development has a second, narrower rule. The compose stack binds 0.0.0.0 so the app can be opened
 * from a phone or another machine, and that arrives as http://10.x.x.x:5173 — an origin no static
 * list can predict. When TRUST_PRIVATE_NETWORK_ORIGINS is set, origins on a private network are
 * accepted as well. It is never set in production, where trusting a private address would mean
 * trusting anything sharing the VPC.
 */
import { config } from "../AppConfig.js";

/** RFC 1918 ranges, loopback, and link-local — addresses that cannot be reached from the internet. */
const PRIVATE_HOST =
  /^(localhost|::1|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})$/i;

function isCloudflareQuickTunnelOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

export function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    // URL keeps IPv6 hosts in brackets; the pattern above matches the bare address.
    return PRIVATE_HOST.test(hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string): boolean {
  if (config.allowedOrigins.includes(origin.replace(/\/+$/, ""))) return true;
  if (config.trustCloudflareQuickTunnels && isCloudflareQuickTunnelOrigin(origin)) return true;
  return config.trustPrivateNetworkOrigins && isPrivateNetworkOrigin(origin);
}

/**
 * The list better-auth checks a request against. A function rather than an array so a development
 * request from a private address can be trusted on the strength of that request alone, without the
 * address having to be known in advance.
 */
export function trustedOrigins(request?: Request): string[] {
  const origin = request?.headers.get("origin");
  const trustedDynamicOrigin = origin && (
    (config.trustPrivateNetworkOrigins && isPrivateNetworkOrigin(origin)) ||
    (config.trustCloudflareQuickTunnels && isCloudflareQuickTunnelOrigin(origin))
  );
  return trustedDynamicOrigin ? [...config.allowedOrigins, origin] : [...config.allowedOrigins];
}
