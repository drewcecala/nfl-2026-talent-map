import React from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import {
  NFLTalentMap,
  StaticTalentPoster,
} from "../app/nfl-talent-map/NflTalentMap";

const path = window.location.pathname.replace(/\/+$/, "");
let app: React.ReactNode;
if (path.endsWith("/nfl-talent-map/reddit")) {
  document.title = "Reddit map | The Geography of NFL Talent";
  app = <StaticTalentPoster format="reddit" />;
} else if (path.endsWith("/nfl-talent-map/wide")) {
  document.title = "Wide map | The Geography of NFL Talent";
  app = <StaticTalentPoster format="wide" />;
} else {
  document.title = "Interactive county map | The Geography of NFL Talent";
  app = <NFLTalentMap />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <React.StrictMode>
    {app}
  </React.StrictMode>,
);
