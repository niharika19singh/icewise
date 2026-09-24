import type { Metadata } from "next";
import MissionConfiguration from "@/components/mission-config/MissionConfiguration";

export const metadata: Metadata = {
  title: "ICEWISE — Vessel & Mission Configuration",
};

export default function MissionConfigurationPage() {
  return <MissionConfiguration />;
}
