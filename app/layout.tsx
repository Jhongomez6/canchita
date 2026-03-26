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
  themeColor: "#1f7a4f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-slate-50 min-h-screen" suppressHydrationWarning>
        {/* Splash screen inline — se renderiza con el HTML antes de React */}
        <div
          id="app-splash"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1b501b',
            transition: 'opacity 0.3s ease-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-1024.png"
            alt=""
            width={180}
            height={180}
            style={{ borderRadius: '24px' }}
          />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                var splash = document.getElementById('app-splash');
                if (splash) {
                  splash.style.opacity = '0';
                  setTimeout(function() { splash.remove(); }, 300);
                }
              });
            `,
          }}
        />
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