import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Toaster } from "react-hot-toast";
import BetaFeedbackWidget from "@/components/BetaFeedbackWidget";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { SpeedInsights } from "@vercel/speed-insights/next";



export const metadata: Metadata = {
  title: "Canchita",
  description: "Encuentra donde jugar hoy",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
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
            <Toaster
              position="bottom-center"
              containerStyle={{
                bottom: 100, // Above the 80px bottom nav
              }}
              toastOptions={{
                style: {
                  background: '#334155', // slate-700
                  color: '#fff',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 500,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            />
            <BetaFeedbackWidget />
            <PWAInstallPrompt />
            <SpeedInsights />
          </div>

          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}