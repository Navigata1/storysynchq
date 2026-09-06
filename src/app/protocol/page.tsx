import type { Metadata } from "next";
import { ProtocolPage } from "@/components/protocol/ProtocolPage";

export const metadata: Metadata = {
  title: "The SSYNC Protocol — .storysync v2.0",
  description:
    "The open format behind StorySync: seven layers in one manifest, a ZIP container, and the published-audio codec rule that makes a tape recorded on Android play on an iPad.",
};

export default function Protocol() {
  return <ProtocolPage />;
}
