# Hisuiki code conventions

These rules apply to new code immediately. Existing code moves toward them through
[`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md); unrelated changes should not include opportunistic mass
renames.

## 1. Search symbols before changing code

Code navigation is a required first step, not an optional cleanup step.

1. Before adding a public symbol, run `pnpm symbols <Name>` to find an existing definition or a
   collision.
2. Before changing or moving a symbol, use the TypeScript language service's **Find All
   References**. Use **Rename Symbol** for the change; do not rename code with textual replacement.
3. Use `rg` after the symbol operation for things TypeScript cannot see: CSS selectors, translation
   keys, JSON fields, route strings, test fixtures and dynamically constructed names.
4. Search again after the change. A successful compilation does not prove that a dynamic reference
   was updated.

If `rg` is unavailable, use the next available text-search tool. Never rely on memory or browse the
tree by hand when a symbol or text search can answer the question.

## 2. Names describe roles

- React components, classes, interfaces, type aliases and enums use `PascalCase`.
- Functions, variables and hooks use `camelCase`; hooks start with `use`.
- Constants shared by a module use `UPPER_SNAKE_CASE` only when they are genuinely constant values.
- Avoid context-free public names such as `Link`, `Content`, `Title`, `Container`, `Shell`, `Props`
  or `Data`. Prefix or suffix the role: `AppLink`, `PageContentWidget`, `NavigationTitleWidget`,
  `LayoutContainerWidget`, `MainWindow`, `BoardFeedProps`.
- Page-level components end in `Page`; widget implementations end in `Widget`; context providers end
  in `Provider`; HTTP clients end in `Client`; repositories end in `Repository`.
- Boolean names begin with `is`, `has`, `can`, `should` or `show`. Event callbacks begin with `on` in
  props and `handle` inside an implementation.

### File and primary-symbol agreement

A file containing a component or class has one primary runtime symbol, and their names match
exactly:

```text
AppRouter.tsx     -> AppRouter
AppHeader.tsx     -> AppHeader
MainWindow.tsx    -> MainWindow
BoardFeedWidget.tsx -> BoardFeedWidget
```

A component directory repeats that name (`AppRouter/AppRouter.tsx`) only when it contains tests,
styles or private supporting files. Do not create a directory for a single leaf file merely to add
an `index.ts`.

Every application source filename starts with uppercase, including hooks and utility modules:
`UseWidgetTree.ts`, `RouteMatchingUtils.ts`, `ImageResizeUtils.ts`. Framework-reserved files such as
`package.json`, `vite.config.ts`, Prisma configuration/migrations and locale codes keep the names
required by their tools.

Barrel files exist only at intentional public boundaries. Internal code imports the defining module
instead of reaching through multiple barrels.

## 3. Directory ownership

Frontend code follows these boundaries:

```text
src/
  App/                 application composition and MainWindow
  Common/
    Components/        reusable, domain-neutral UI
    Hooks/             reusable React hooks
    Providers/         shared React state boundaries
    Routing/           AppRouter, AppLink and navigation integration
    Types/             frontend contracts, props and shared state shapes
    Utils/             pure reusable functions; no React and no network I/O
  Modules/             route/page features
  Services/            network, authentication, persistence and external adapters
  Widgets/             widget implementations and registry
```

The API mirrors this where useful with `server/src/Common/Types` and
`server/src/Common/Utils`. Express handlers remain in `server/src/routes`; database, storage and
external-system boundaries remain in `server/src/services`.

Rules:

- Pure reusable code belongs in `Common/Utils`, even when it was first written for one service.
- `Services` is reserved for I/O or integration boundaries. A file containing both transport and
  pure transformation logic is split.
- Shared or exported interfaces, type aliases and enums belong in `Common/Types`. A truly private
  component prop or reducer-state shape may remain beside its only consumer.
- `Common/Types` and `Common/Utils` never import from `Modules`, `Widgets` or `Services`.
- Modules and widgets may depend on Common and Services; Common must not depend on a page module.
- Frontend and server contracts have one canonical definition when their shapes are identical.
  Transport mapping is explicit when the shapes intentionally differ.

## 4. Components stay narrow

- A page component composes sections; it does not also implement transport, layout algorithms and
  modal infrastructure.
- Reusable behavior goes into a named hook only when at least two consumers need it or when it
  isolates a coherent state machine.
- Prefer composition over large boolean prop matrices.
- Keep side effects in providers, hooks or services. Render functions derive output from state.
- Do not introduce special `AppHeader` or `AppFooter` components when the product model represents
  them as configurable widget containers. Names describe real architecture, not visual position.

## 5. Types are explicit at boundaries

- Do not use `Props`, `Data`, `Result` or `Response` as exported type names. Include the domain.
- API response types describe the wire shape; domain types describe application state. Do not make
  fields optional merely to reuse one type for both.
- Prefer discriminated unions for states and routes over unrelated booleans.
- Avoid redefining an imported domain type under a second name. Current collisions such as
  `BoardSettings`, `PhotoDetail`, `ProfileScope`, `Border` and `Shadow` must be resolved during the
  type migration.
- Keep `unknown` at untrusted boundaries and narrow it once. Avoid `any`.

## 6. Reuse without speculative abstraction

Before writing similar logic, search for the existing symbol and run duplicate detection:

```bash
pnpm symbols readJson
pnpm dlx jscpd src server/src --min-lines 8 --min-tokens 60 --reporters console
```

Extract a shared implementation when the behavior and change reasons are the same. Similar-looking
markup with different accessibility or lifecycle requirements may remain separate. Every extraction
must have a role-based name; `helpers.ts`, `utils.ts` and `common.ts` are not acceptable filenames.

## 7. Refactor discipline

- Separate renames/moves from behavior changes whenever possible.
- Use temporary re-export shims during multi-step moves, then remove them in the same milestone.
- Preserve public route, API and persisted-layout shapes unless a migration is part of the plan.
- Keep each batch reviewable and leave the application buildable.
- Run frontend typecheck/build, API typecheck/security tests, `git diff --check`, and relevant browser
  flows after every batch. Visual changes require browser evidence.
