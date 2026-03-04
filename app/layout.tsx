import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Toaster } from "react-hot-toast";
import BetaFeedbackWidget from "@/components/BetaFeedbackWidget";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";



export const metadata: Metadata = {
  title: "Canchita",
  description: "Encuentra donde jugar hoy",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-slate-50 min-h-screen" suppressHydrationWarning>
        <AuthProvider>
          <div className="md:hidden">
            <Header />
          </div>
          <div className="hidden md:block">
            <Header />
          </div>

          <div className="pb-24 md:pb-0">
            {children}
            <Toaster position="top-center" />
            <BetaFeedbackWidget />
            <PWAInstallPrompt />
          </div>

          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}