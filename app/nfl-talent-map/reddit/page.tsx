import type { Metadata } from "next";
import { StaticTalentPoster } from "../NflTalentMap";

export const metadata: Metadata = {
  title: "Reddit map",
  robots: { index: false, follow: false },
};

export default function RedditPosterPage() {
  return <StaticTalentPoster format="reddit" />;
}
