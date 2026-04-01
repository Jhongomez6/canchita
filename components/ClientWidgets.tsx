"use client";

import dynamic from "next/dynamic";

const BetaFeedbackWidget = dynamic(() => import("@/components/BetaFeedbackWidget"), { ssr: false });
const PWAInstallPrompt = dynamic(() => import("@/components/PWAInstallPrompt"), { ssr: false });

export default function ClientWidgets() {
  return (
    <>
      <BetaFeedbackWidget />
      <PWAInstallPrompt />
    </>
  );
}
