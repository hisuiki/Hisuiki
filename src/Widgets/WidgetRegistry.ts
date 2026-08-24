import type { WidgetRegistry } from "../Types/TypeRegistry";

import Account from "./Account/Account";
import Bio from "./Bio/Bio";
import Boards from "./Boards/Boards";
import Brand from "./Brand/Brand";
import Colophon from "./Colophon/Colophon";
import Container from "./Container/Container";
import Content from "./Content/Content";
import Heatmap from "./Heatmap/Heatmap";
import Identity from "./Identity/Identity";
import Links from "./Links/Links";
import Spacer from "./Spacer/Spacer";
import Title from "./Title/Title";
import Text from "./Text/Text";
import Timeline from "./Timeline/Timeline";
import Webamp from "./Webamp/Webamp";

/**
 * Every widget there is.
 *
 * The registry is the single place a widget has to be named. Its metadata — label, sizes, whether
 * removing it asks first — is in Services/layout's WIDGETS table, keyed by the same kind, and the
 * two are kept in step by the WidgetKind union: adding a kind fails to compile until both have an
 * entry for it.
 *
 * They are separate files rather than one because the layout engine reads and writes stored
 * documents with no React involved, and importing components into it would make this registry import
 * the board that renders containers, which imports this registry.
 */
export const WIDGET_REGISTRY: WidgetRegistry = {
  container: Container,
  content: Content,
  boards: Boards,
  title: Title,
  account: Account,
  brand: Brand,
  colophon: Colophon,
  identity: Identity,
  links: Links,
  bio: Bio,
  heatmap: Heatmap,
  timeline: Timeline,
  text: Text,
  spacer: Spacer,
  webamp: Webamp,
};

export { ProfileScopeProvider, useProfileScope } from "./ProfileScopeProvider";
