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
import { config } from "../config.js";
import { prisma } from "./prisma.js";

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

  // An incompletely provisioned provider is omitted instead of turning a button click into a 500.
  // /api/auth/providers exposes the same flags so the sign-in page can label it unavailable.
  socialProviders: {
    ...(config.auth.github.configured
      ? {
          github: {
            clientId: config.auth.github.clientId,
            clientSecret: config.auth.github.clientSecret,
          },
        }
      : {}),
    ...(config.auth.google.configured
      ? {
          google: {
            clientId: config.auth.google.clientId,
            clientSecret: config.auth.google.clientSecret,
          },
        }
      : {}),
  },

  // Same list the CORS check uses: an origin trusted to call the API is trusted to be returned to
  // after a social redirect, and keeping one list means the two cannot drift apart.
  trustedOrigins: config.allowedOrigins,

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
