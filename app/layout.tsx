import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
import { AuthProvider } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { Toaster } from "react-hot-toast";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ClientWidgets from "@/components/ClientWidgets";



export const metadata: Metadata = {
  title: "La Canchita",
  description: "Encuentra donde jugar hoy",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://checkout.wompi.co/widget.js" async />
      </head>
      <body className={`${plusJakartaSans.variable} font-sans antialiased text-slate-900 bg-slate-50 min-h-screen`} suppressHydrationWarning>
        {/* Inline HTML splash — paints at TTFB, before JS hydration */}
        <div
          id="app-splash"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "linear-gradient(135deg, #1f7a4f, #145c3a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>
            {/* Balón orbitando el círculo central de la C */}
            <div style={{ position: "relative", width: "104px", height: "104px" }}>
              {/* Guía punteada (trayectoria) */}
              <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" />
              </svg>
              {/* Símbolo C */}
              <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                <path d="M72.3 29.9 A30 30 0 1 0 72.3 70.1" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
                <circle cx="50" cy="50" r="8" fill="#fff" />
              </svg>
              {/* Balón que orbita */}
              <div className="splash-spin" style={{ position: "absolute", inset: 0 }}>
                <svg viewBox="0 0 100 100" className="splash-ball">
                  <circle cx="50" cy="50" r="45" fill="#fff" stroke="#145c3a" strokeWidth="6" />
                  <path d="M50 33 L66.2 44.7 L60 63.8 L40 63.8 L33.8 44.7 Z" fill="#145c3a" />
                  <line x1="50" y1="33" x2="50" y2="6" stroke="#145c3a" strokeWidth="5" />
                  <line x1="66.2" y1="44.7" x2="92.8" y2="36.1" stroke="#145c3a" strokeWidth="5" />
                  <line x1="60" y1="63.8" x2="76.5" y2="86.4" stroke="#145c3a" strokeWidth="5" />
                  <line x1="40" y1="63.8" x2="23.5" y2="86.4" stroke="#145c3a" strokeWidth="5" />
                  <line x1="33.8" y1="44.7" x2="7.2" y2="36.1" stroke="#145c3a" strokeWidth="5" />
                </svg>
              </div>
            </div>
            {/* Wordmark blanco */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/lacanchita-logo-white.png"
              alt="La Canchita"
              width={170}
              height={33}
              style={{ height: "auto", width: "170px" }}
              fetchPriority="high"
            />
          </div>
          <style dangerouslySetInnerHTML={{ __html: `@keyframes splash-rot{to{transform:rotate(360deg)}}.splash-spin{animation:splash-rot 1.15s linear infinite}.splash-ball{position:absolute;left:50%;top:50%;width:19px;height:19px;transform:translate(-50%,-50%) translateY(-31px)}@media (prefers-reduced-motion:reduce){.splash-spin{animation:none}}` }} />
        </div>

        <AuthProvider>
          <Header />

          <div className="pb-28 md:pb-0">
            {children}
            <Toaster
              position="bottom-center"
              containerStyle={{
                bottom: 100,
              }}
              toastOptions={{
                style: {
                  background: '#334155',
                  color: '#fff',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 500,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            />
            <ClientWidgets />
            <SpeedInsights />
          </div>

          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}