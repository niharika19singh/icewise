import type { Metadata } from "next";
import CommandCenter from "@/components/command-center/CommandCenter";

export const metadata: Metadata = {
  title: "ICEWISE — Command Center",
};

export default function CommandCenterPage() {
  return <CommandCenter />;
}
