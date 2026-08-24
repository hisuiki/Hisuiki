import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { assetUrl } from "../../Services/AppConfig";

/** The NukaWorks mark. */
export default function Brand() {
  return (
    <ExternalLink href="https://nuka.works/" label="NukaWorks" className="sunproj-logo">
      <SmartImage
        src={assetUrl("logo_nwrks.png")}
        alt="NukaWorks Logo"
        width="40px"
        height="40px"
        style={{ borderRadius: "50%" }}
      />
      <p>
        <span className="logo-bold">Nuka</span>
        <span className="logo-light">Works</span>
      </p>
    </ExternalLink>
  );
}
