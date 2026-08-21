import type { Metadata } from "next";
import { StaticTalentPoster } from "../NflTalentMap";

export const metadata: Metadata = {
  title: "Wide map",
  robots: { index: false, follow: false },
};

export default function WidePosterPage() {
  return <StaticTalentPoster format="wide" />;
}
