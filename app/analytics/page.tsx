import type { Metadata } from "next";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";

export const metadata: Metadata = {
  title: "ICEWISE — Mission Analytics",
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
