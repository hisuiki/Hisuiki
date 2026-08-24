import { useTranslation } from "react-i18next";
import ActivityHeatmap from "../../Common/Components/ActivityHeatmap/ActivityHeatmap";
import { useProfileScope } from "../ProfileScopeProvider";

/** A year of posting, in the GitHub grid. */
export default function Heatmap() {
  const { i18n } = useTranslation();
  const scope = useProfileScope();
  if (!scope) return null;

  return (
    <ActivityHeatmap
      dates={scope.activityDates ?? scope.timeline.map((post) => post.createdAt)}
      isJapanese={i18n.language === "ja"}
    />
  );
}
