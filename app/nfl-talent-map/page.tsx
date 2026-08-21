import type { Metadata } from "next";
import { NFLTalentMap } from "./NflTalentMap";

export const metadata: Metadata = {
  title: "Interactive county map",
  description:
    "Compare verified high-school counties for 2015–2026 by default, audit coverage by era, and explore the full 2000–2026 NFL Draft dataset with explicit evidence controls.",
};

export default function NFLTalentMapPage() {
  return <NFLTalentMap />;
}
