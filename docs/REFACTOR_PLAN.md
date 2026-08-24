# Hisuiki refactor plan

This is a structural refactor. It must preserve routes, API contracts, persisted widget JSON and
visual behavior unless a milestone explicitly says otherwise.

## Audit baseline — 2026-08-24

Tool-assisted inventory of `src` and `server/src` found:

- 97 TypeScript/TSX source files.
- No current mismatch between a file basename and its named default component, but many public
  symbols remain context-free (`Link`, `Content`, `Title`, `Container`, `Shell`, `Boards`).
- 78 interface/type declarations outside a type directory.
- 165 exports under frontend `Services`; many are pure layout, grid, route and formatting helpers
  rather than I/O services.
- Five clone groups (68 lines total) from `jscpd`: dialog shells, three collection loading/error
  blocks, repeated PageHistory controls, and API JSON request handling.
- Largest refactor risks: `WidgetBoard.tsx` (1,178 lines), `LayoutUtils.ts` (1,115), `Inspector.tsx`
  (678), server photo routes (496), `PhotoDetail.tsx` (456), `PageEditor.tsx` (426), and
  `router.tsx` (385).
- Known symbol collisions: `BoardSettings` type/component, `PhotoDetail` data/component,
  `ProfileScope` duplicate definitions, and `Border`/`Shadow` duplicate aliases.

Re-run the inventory at the end of every milestone; these numbers are a baseline, not permanent
targets.

## Milestone 0 — guardrails and navigation correctness

Status: in progress.

- Add these conventions and the local `pnpm symbols` command.
- Keep route content staged: outgoing content renders through leave, incoming content switches with
  its layout at enter.
- Keep FLIP layout motion editor-only so it cannot fight page transitions.
- Add a browser regression flow that asserts route content and active navigation before/after the
  transition boundary.
- Update `AGENTS.md` to link to the conventions instead of duplicating them.

Exit gate: frontend build; server typecheck/security tests; browser transition assertion; clean diff
check.

## Milestone 1 — establish application names and boundaries

Use TypeScript Rename Symbol and move one connected group at a time:

| Current | Target |
| --- | --- |
| internal `Shell` in `App.tsx` | `App/MainWindow.tsx` → `MainWindow` |
| `Services/AppRouter.tsx::AppRouter` | `Common/Routing/AppRouter.tsx` |
| `Services/AppRouter.tsx::AppLink` | `Common/Routing/AppLink.tsx` |
| pure route parsing from `AppRouter.tsx` | `Common/Utils/RouteMatchingUtils.ts` |
| `Services/PageLayoutProvider.tsx` | `Common/Providers/PageLayoutProvider.tsx` |
| `Services/ExternalLinkProvider.tsx` | `Common/Providers/ExternalLinkProvider.tsx` |

Keep `App.tsx` as the composition root. Do not create a fixed `AppHeader`: the header and footer are
widget containers in the product model.

Exit gate: no generic `Link` or `Shell` symbol; navigation regression still passes; no import cycle
from Common into Modules.

## Milestone 2 — centralize types

Create focused files under `src/Common/Types`:

- `AuthTypes.ts`, `BoardTypes.ts`, `ContentTypes.ts`, `NavigationTypes.ts`, `ProfileTypes.ts`,
  `WidgetTypes.ts`, and `UiTypes.ts`.
- Move all exported frontend interfaces/type aliases from `src/Types`, `Services`, Modules and widget
  context into those files.
- Keep component-private props local only when they have exactly one consumer and are not exported.
- Leave a temporary `src/Types/TypeRegistry.ts` compatibility barrel while imports migrate; remove it at the
  end of this milestone.

Resolve collisions deliberately:

| Current collision | Target names |
| --- | --- |
| `BoardSettings` | `BoardLayoutSettings` and `BoardSettingsButton` |
| `PhotoDetail` | `PhotoDetailData` and `PhotoDetailPage` |
| duplicate `ProfileScope` | one `ProfileWidgetScope` |
| `Border`, `Shadow` | `WidgetBorderStyle`, `WidgetShadowStyle` |

Mirror the rule in `server/src/Common/Types` for server-only contracts. Extract a shared frontend/API
contract package only after identifying genuinely identical wire shapes; do not make a root dumping
ground.

Exit gate: symbol audit reports no exported domain types in Services or Modules and no duplicate
top-level type names.

## Milestone 3 — separate utilities from services

Move pure logic to `Common/Utils` in dependency order:

1. `GridUtils.ts`, `PathUtils.ts`, `ImageResizeUtils.ts`, `WidgetValidationUtils.ts`.
2. Split `TitleWidgetUtils.ts` into navigation types/config and `TitleActionUtils.ts` parsing.
3. Split `WidgetStyleUtils.ts` into style constants, readers and CSS variable conversion.
4. Split `LayoutUtils.ts` into `WidgetCatalog.ts`, `WidgetSizingUtils.ts`, `WidgetTreeUtils.ts`,
   `LayoutMigrationUtils.ts`, `LayoutSerializationUtils.ts` and `WidgetFactory.ts`.
5. Keep `ContentApiService.ts`, `AdminService.ts`, `BoardService.ts`, `PhotoService.ts`,
   `ProfileService.ts`, `SiteService.ts`, auth and external
   adapters in Services because they perform I/O.

Each new file owns one vocabulary. There will be no `helpers.ts`, generic `utils.ts`, or barrel that
re-exports private implementation details.

Exit gate: Services contains integration boundaries only; `LayoutUtils.ts` compatibility exports are
removed; persisted layout fixtures round-trip unchanged.

## Milestone 4 — give pages and widgets role-based names

Rename primary components and their files together:

| Current | Target |
| --- | --- |
| `About` | `AboutPage` |
| `Admin` | `AdminPage` |
| `Landing` | `BoardDiscoveryPage` |
| `Photos` | `PhotosPage` |
| `Settings` | `SettingsPage` |
| `SignIn` | `SignInPage` |
| `BoardManager` | `BoardsPage` |
| `Content` widget | `PageContentWidget` |
| `Boards` widget | `BoardFeedWidget` |
| `Title` widget | `NavigationTitleWidget` |
| `Container` widget | `LayoutContainerWidget` |
| remaining one-word widgets | add the `Widget` suffix |
| `Inspector` | `WidgetInspector` |
| `WidgetBoard` | `WidgetCanvas` |

Translation keys and persisted `WidgetKind` values do not change merely because component names do.
Search those dynamic references separately after every rename.

Exit gate: every public component filename equals its role-based symbol; gallery registry and all
routes render in browser checks.

## Milestone 5 — split oversized state machines

Split by behavior, not arbitrary line count:

- `WidgetCanvas`: `useWidgetDrag`, `useWidgetResize`, `useWidgetSelection`, `WidgetChrome`,
  `WidgetDropHint`, and `WidgetContextMenu`. Keep one owner for drag state.
- `WidgetInspector`: shell/tabs plus General, Layout, Appearance and Advanced sections. Field
  components remain shared.
- `PhotoDetailPage`: data hook, media view, social panel and comment list.
- `PageEditor`: editor state hook, metadata form, preview and history boundary.
- Server photo/post/board routes: parsing/validation, authorization and response mapping move to
  named Common utilities or domain services; Express handlers remain thin.

Do not extract tiny wrappers solely to reduce line counts. Each extracted unit needs independent
behavior, a stable input contract and a searchable role name.

Exit gate: no UI state-machine file over roughly 500 lines without a written exception; drag,
resize, editor and photo browser flows pass.

## Milestone 6 — remove verified duplication

Address the five measured clone groups:

1. Add one `ApiClient` for credentialed requests, JSON parsing and error normalization; migrate
   admin, board, photo and profile clients.
2. Extract a shared accessible dialog frame used by `AppModal` and `ConfirmDialog`, preserving their
   distinct actions.
3. Introduce a reusable collection-state view only if PageHistory, PostsIndex and PhotoGallery still
   share identical loading/error/empty behavior after their state hooks are split.
4. Replace PageHistory's duplicate previous/current control markup with one named component.

Run `jscpd` again. Zero duplication is not the goal; one authoritative implementation for behavior
that changes together is.

Exit gate: API clients have one transport path; clone count does not regress; accessibility browser
checks pass.

## Milestone 7 — enforce the convention

- Add an ESLint naming rule for exported types/components and boolean identifiers.
- Add a repository check that verifies component filename/primary-symbol agreement and forbidden
  generic public names.
- Add import-boundary checks for `Common/Types` and `Common/Utils`.
- Put typecheck, build, API tests, convention checks and a bounded `jscpd` threshold in CI.
- Remove all compatibility barrels and document any remaining exceptions beside the rule they need.

Final exit gate: a clean checkout passes one `pnpm check` command and the symbol/type/duplication
audit is recorded in the pull request.

## Batch protocol

For every milestone:

1. Run `pnpm symbols <Symbol>` and language-service Find All References before editing.
2. Make moves/renames separately from behavior changes.
3. Search CSS, locales, JSON, persisted kinds and routes with `rg` after symbol-aware renames.
4. Run frontend typecheck/build, API typecheck and security tests, `git diff --check`, then the
   relevant browser scenario.
5. Record before/after symbol paths and any compatibility shim still present.
