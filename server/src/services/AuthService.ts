/**
 * better-auth: sign-in and account creation through GitHub, Google, or a local email and password.
 *
 * The session is an HttpOnly cookie the library sets and reads itself — there is no token for the
 * frontend to hold, which is the point of the move away from the previous hand-rolled flow.
 * Everything the app asks about identity goes through services/identity.ts rather than through this
 * module directly.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { config } from "../AppConfig.js";
import { prisma } from "./PrismaService.js";
import { trustedOrigins } from "./OriginUtils.js";


/** Which social providers are configured, in the shape better-auth wants them. */
function enabledProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  for (const [name, credentials] of [
    ["github", config.auth.github],
    ["google", config.auth.google],
  ] as const) {
    if (credentials.clientId && credentials.clientSecret) {
      providers[name] = { clientId: credentials.clientId, clientSecret: credentials.clientSecret };
    }
  }

  return providers;
}

/** The names of those providers, for the sign-in page to decide what to show. */
export const availableProviders = (): string[] => Object.keys(enabledProviders());

export const auth = betterAuth({
  appName: config.auth.appName,
  baseURL: config.auth.baseUrl,
  secret: config.auth.secret,

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // No mail is sent from this service yet, so requiring verification would lock out every local
    // account at the moment it was created. Turn this on together with an email sender.
    requireEmailVerification: false,
  },

  /**
   * Only the providers that have credentials.
   *
   * Registering one without a client id does not fail at startup — it fails when somebody presses
   * the button, deep inside the authorisation-URL builder, as a 500 whose message never reaches the
   * browser. A provider that cannot work is better left unregistered, so the attempt is refused
   * cleanly and the sign-in page can decline to offer it at all. This is the ordinary state of a
   * development stack, which has no OAuth application of its own.
   */
  socialProviders: enabledProviders(),

  // The same rule the CORS check uses: an origin trusted to call the API is trusted to be returned
  // to after a social redirect, and sharing one implementation means the two cannot drift apart.
  trustedOrigins,

  advanced: {
    /**
     * The API answers on api.hisuiki.com but the frontend is served from hisuiki.com, so a cookie
     * left on the API's own host would never be sent back. Scoping it to the parent domain fixes
     * that, and is also what will let per-profile subdomains share one session later.
     *
     * The two hosts are the same site, so SameSite=Lax still permits the frontend's requests; this
     * is a cross-*origin* setup, not a cross-site one, and it needs no SameSite=None.
     */
    crossSubDomainCookies: config.auth.cookieDomain
      ? { enabled: true, domain: config.auth.cookieDomain }
      : { enabled: false },

    /**
     * Behind Cloud Run and the load balancer there is no socket address to read, so without this
     * better-auth cannot resolve a client IP and falls back to a single shared rate-limit bucket
     * per path — which means one abusive caller throttles everyone at once. The load balancer
     * appends the real client address to X-Forwarded-For.
     */
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
});
