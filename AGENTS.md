# AGENTS.md

Working rules for humans and coding agents in this repository. Read this before making changes.

## What this is

`about-me` is the personal site behind `hisuiki.com`. It has three parts:

| Part      | Location    | Stack                                                          |
| --------- | ----------- | -------------------------------------------------------------- |
| Frontend  | `src/`      | React 19 + TypeScript, Vite, SCSS. Root pnpm package.           |
| API       | `server/`   | Express 5 + TypeScript. Its own pnpm package.                   |
| Infra     | `terraform/`| Google Cloud (project `hisuiki`): two Cloud Run services, assets bucket, Cloud SQL (Postgres), global ALB + Cloud CDN, Secret Manager, Workload Identity Federation. |

Content (markdown pages, images) does not live in git. It sits in the assets bucket under the
`static/` prefix and is edited through the API by anyone signed in.

The API remains a separate workspace package so its dependencies (`express`,
`@google-cloud/storage`, `better-auth`, `@prisma/client`) never reach the browser bundle.

## Two services, one image

Production runs **one image as two Cloud Run services**, split by hostname:

| Host              | Service        | `APP_ROLE` | Serves                        |
| ----------------- | -------------- | ---------- | ----------------------------- |
| `hisuiki.com`     | `hisuiki-web`  | `web`      | the built React bundle        |
| `api.hisuiki.com` | `hisuiki-api`  | `api`      | Express `/api`                |
| `cdn.hisuiki.com` | —              | —          | the assets bucket, via Cloud CDN |

`APP_ROLE` is read in `server/src/AppConfig.ts` and gates what `Server.ts` mounts. It defaults to
`combined`, which is what local development wants: one process, everything, same origin.

The split is not free, and three things depend on getting it right:

- **`VITE_API_BASE_URL` is baked in at build time.** The bundle can no longer assume its own origin,
  so the deploy workflow passes the API host as a build argument. Empty in development, where Vite's
  proxy keeps things same-origin.
- **Every authenticated request must send credentials.** `credentials: "include"` is set on the
  better-auth client and on the photo and page-save calls. Miss it on a new call and the app looks
  permanently signed out.
- **The session cookie is scoped to the parent domain** through `AUTH_COOKIE_DOMAIN=.hisuiki.com`,
  because a cookie left on `api.hisuiki.com` is never sent by `hisuiki.com`. The two are the same
  site, so `SameSite=Lax` still works — this is cross-origin, not cross-site.

The API has no CDN in front of it. That is the point of separating the origins: when the two shared
a hostname, every authenticated response had to opt out of caching individually, and one missing
header would have put a signed-in user's data in a shared cache.

## Layout

```
src/Common/Components/   Reusable UI (AppModal, Skeleton, PageEditor, ...)
src/Common/Theme/        app.scss: the whole visual system, including :root palette tokens
src/Modules/             Page-level features (FileViewer, Photos, Header, Footer)
src/Services/            Router, auth, api client, palette, paths, config
server/src/routes/       Express route handlers
server/src/services/     Storage, auth, identity, photos, Prisma, rate limiting
server/prisma/           schema.prisma: better-auth's four tables
```

## Code conventions and refactoring

The enforceable naming, file-placement, type, utility, duplication and symbol-search rules are in
[`docs/CODE_CONVENTIONS.md`](docs/CODE_CONVENTIONS.md). The staged migration of existing code is in
[`docs/REFACTOR_PLAN.md`](docs/REFACTOR_PLAN.md).

Before adding, moving or renaming a symbol, run `pnpm symbols <Name>` and use the TypeScript language
service's Find All References/Rename Symbol operation. Follow it with text search for CSS selectors,
translation keys, JSON, routes and other dynamic references.

## Commands

Package manager is pnpm (pinned via `packageManager`). Run from the repo root:

```
pnpm install
pnpm dev          # Vite dev server
pnpm build        # tsc --noEmit && vite build
pnpm typecheck
pnpm lint         # eslint .; pnpm lint:fix to autofix
```

For the API: `pnpm --filter hisuiki-server dev` (tsx watch), `... build`, `... typecheck`. Each of
those runs `prisma generate` first, because the generated client lives in `server/src/generated/`
and is gitignored — a fresh clone has no client until something generates one.

Database work needs `DATABASE_URL` exported (Prisma 7 does not read `.env` itself):
`pnpm --filter hisuiki-server migrate` applies migrations.

There is no test suite. Verification therefore means: `pnpm typecheck`, `pnpm lint`, and a real
`pnpm build` before you commit. If a change is visual, say plainly that it was not confirmed in a
browser rather than implying it was.

## Branching and git workflow

Two long-lived branches:

- `develop`: where work lands.
- `main`: what deploys. Receives `develop` through merge commits subjected
  `Merge branch 'develop' into main: <topic>`.

CI pushes `chore: bump build number to N [skip ci]` commits directly to `main` on every deploy, so
`main` is routinely ahead of `develop`. Always `git fetch` and fast-forward before merging or
pushing, or the push is rejected.

### Hotfixes go to both branches

A hotfix exists because production is currently wrong, and `main` is the deploying branch. A fix
parked on `develop` until the next release merge fixes nothing for visitors.

So: **when the user asks to push a hotfix, commit and push it on both branches.** Land the commit
on one branch, push, then cherry-pick that same commit onto the other and push that too. Confirm
both branches are in sync with `origin` afterwards. Cherry-picking (rather than only merging)
keeps both branches carrying the fix immediately, so neither the next deploy from `main` nor the
next feature merge from `develop` can silently drop or revert it.

Normal feature work still follows the plain `develop` to `main` merge flow.

### Commit messages

Subject convention is `Area::Component:: Summary`, for example:

```
Web::FileViewer:: Replay the Metro entrance animation once the page has loaded
Web::Theming:: Hotfix: restore text-shadow on h1-h6 titles
Infra::IAM:: Grant CI bucket-level read on both buckets
Server::Services::BlobStorageService: Use the object prefix from config
```

Areas in use: `Web`, `Server`, `Infra`, `CI`, `Common`, and `+` combinations such as
`Web+Server::` or `Infra::CloudRun+CDN::`.

Use colons rather than dashes or em dashes as separators in commit messages. Hotfixes carry a
`Hotfix:` marker after the component.

Explain why in the body, not just what. Agents end commit messages with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Commit and push only when asked.

## Theming: never hardcode a color

The palette is derived at runtime. `src/Services/PaletteUtils.ts` samples the current wallpaper for its
dominant hue and overall luminance, then rewrites the `--color-*` custom properties through one
shared saturation/lightness ramp, checking every derived color against WCAG relative luminance and
nudging it lighter until it clears the minimum ratio for its role. A wallpaper bright enough to
wash out text also gets a scrim.

Consequences for any change that touches color:

- Style against the `--color-*` tokens. A literal hex or `rgba()` in a rule will not follow the
  wallpaper, and will visibly disagree with the tokens around it on a non-default photo.
- Every token needs a static fallback in the `:root` block of `src/Common/Theme/App.scss`. Palette
  sampling resolves to null on failure (404, CORS-tainted canvas), which deliberately leaves the
  static palette in place.
- New tokens belong in `buildPaletteVars()` alongside the existing ones, built from the same
  `hue` and `scale()` ramp so they desaturate consistently with everything else.
- Text roles are checked against the dark chrome luminance, not the wallpaper, because that is
  what they actually sit on. Keep alpha values when refactoring a surface: changing them changes
  contrast for the text on top.

Animations follow the Metro entrance idiom (`metro-enter`: slide in from the right). CSS
mount-time animations only replay if the node is actually remounted, so React `key` values are
load-bearing for them. Respect `prefers-reduced-motion`.

## Photos

`/photos` is a photo gallery with posting, likes, and comments, served by `server/src/routes/PhotoRoutes.ts`.

Images live in the assets bucket next to everything else, under `photos/media/`. Each post stores
two objects — a full-size image and a grid thumbnail — both produced **in the browser**
(`src/Services/ImageResizeUtils.ts`) before upload. That is why the API has no image library: it stores
bytes the browser already decoded, resized, and re-encoded. Uploads are sent as the raw request
body rather than multipart, so no parser dependency is needed either.

Metadata is JSON in the same bucket: `photos/index.json` is the ordered manifest, and
`photos/social/<id>.json` holds one post's likes and comments. They are separate objects so that a
like does not contend with an unrelated post's edit for the same generation. Every write is a
compare-and-swap against the object's GCS generation and replays its mutation on a lost race
(`server/src/services/PhotoService.ts`).

`services/photos.ts` is the only module that knows any of that. The routes speak in posts, likes,
and comments, so when post metadata moves to Postgres behind Prisma, only that module changes.

Authorization is deliberately shallow and the limits are what carry the weight: **any signed-in
account may post**. A post or comment can only be changed by its author or by an address listed in
`SITE_OWNER_EMAILS`, who moderates. Uploads are type- and size-capped, and posting, commenting, and
liking are each quota'd per account per hour (`server/src/services/RateLimitService.ts`). Those quotas are
per instance, like every other in-process cache here.

`GET /api/photos` accepts an `?author=` filter. Nothing calls it yet; it exists because profiles are
headed for per-user subdomains, and scoping a gallery to one person should stay a query.

## Authentication

Sign-in is [better-auth](https://better-auth.com) over Postgres: GitHub, Google, or a local email
and password. The session is an HttpOnly cookie the library sets and reads — the browser holds no
token, and `credentials: "include"` on a fetch is what carries identity.

Two rules keep it contained:

- **Read identity through `server/src/services/IdentityService.ts`, never better-auth directly.** `getViewer`
  returns the smallest shape the app needs, and `isSiteOwner` answers moderation. One import to
  change if the provider ever does.
- **better-auth is mounted before `express.json()`** in `server/src/Server.ts`. It parses its own
  bodies off the raw stream, and a JSON parser upstream of it consumes the request first, leaving
  the handler waiting on a stream that never emits.

`server/prisma/schema.prisma` transcribes better-auth's four tables. Verify changes against the
installed version with `better-auth generate` rather than editing them by hand.

## Editing pages

Signed-in accounts edit markdown in `PageEditor` and it is written straight to the bucket by
`PUT /api/pages`. There is no pull request in the loop; the patch/proposal flow it replaced is gone.

The commit message survived that change and is load-bearing. It is stored in the object's custom
metadata alongside the author, and the page history reads it back: bucket versioning keeps every
generation, `GET /api/pages/history` lists them, and `src/Services/HistoryService.ts` diffs one generation
against the previous one in the browser. A save with no message would be a revision with no label,
which is why the field is required.

Consequences worth knowing:

- History starts where versioning does. Revisions predating it do not exist, and anything written to
  the bucket by other means carries no author.
- `terraform/storage.tf` expires non-current generations after 90 days and keeps at most 50 per
  object. Neither limit is visible in the UI, but both bound what history can show.

## Deploy pipelines

| Workflow            | Trigger                                       | Effect                                     |
| ------------------- | --------------------------------------------- | ------------------------------------------ |
| `build-check.yml`   | push to `develop`, PRs into `develop`/`main`  | Compile only, no credentials               |
| `deploy-web.yml`    | push to `main` (ignores Terraform)            | Bumps `version.json`, builds and deploys the combined Cloud Run image |

Deploys authenticate through Workload Identity Federation, never a service-account key.

Database migrations are **not** run by any workflow. The `prisma` CLI is a dev dependency and is not
in the runtime image; apply migrations deliberately, through the Cloud SQL proxy, before deploying a
release that depends on them.

## Infrastructure notes

- **Everything moved to the `hisuiki` project in August 2026.** Content lives in
  `gs://hisuiki-assets-prod` (US, versioned); `nwrks-assets-prod` was copied, verified, and deleted.
  The NukaWorks Prod stack is retired, and its final state is archived in
  `gs://hisuiki-tfstate-prod/archive/nukaworks-prod/` for reference only — never point a backend
  at it.
- **The assets bucket predates this stack**, so `storage.tf` adopts it with an `import` block rather
  than creating it. Leave that block in place until the first apply has run everywhere it matters.
- **The load balancer's IP is new.** `hisuiki.com`'s A record pointed at `8.228.225.172`, which
  belonged to the retired NukaWorks load balancer in another project — an address cannot move
  between projects. Read `terraform output load_balancer_ip` after applying and update the record;
  `api` and `cdn` are CNAMEs to the apex, so that one record carries all three. The managed
  certificate covers all three names and stays `PROVISIONING` until each resolves here.
- Do not change `assets_prefix`. Objects sit under `static/` so that published markdown keeps the
  exact public paths it had before the Azure migration. Changing it breaks every existing link.
- `blog.nuka.works` and `/api` share the blog Cloud Run backend. Cloud CDN uses origin cache
  headers, so API routes must stay private/no-store unless the response is intentionally public.
- Cloud SQL has `deletion_protection = true` and holds the only copy of every account. Its password
  and the session signing secret are generated by Terraform straight into Secret Manager, so neither
  is ever chosen by a person or written to a tfvars file. `GOOGLE_CLIENT_SECRET` is the exception:
  its secret is created empty and the value is added by hand.
- The old Azure stack was decommissioned in August 2026. `scripts/migrate-azure-to-gcp.sh` is kept
  for its historical record of the migration; it no longer has live resources to act on.

## House rules

- Match the surrounding code: this codebase comments the *why* behind non-obvious decisions, and
  new code is expected to do the same.
- `dist/` is build output and is gitignored. Never commit it.
- Do not add dependencies (including dev dependencies) for a small fix without asking.
- Secrets come from Secret Manager or repository secrets. Never commit one, and never put a real
  value in `.env.example`.
- Report outcomes honestly: if a check was skipped or could not run here, say which and why.
