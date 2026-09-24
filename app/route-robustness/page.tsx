import type { Metadata } from "next";
import RouteRobustness from "@/components/robustness/RouteRobustness";

export const metadata: Metadata = {
  title: "ICEWISE — Route Robustness",
};

export default function RouteRobustnessPage() {
  return <RouteRobustness />;
}
