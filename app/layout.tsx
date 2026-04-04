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
          <div
            style={{
              background: "#fff",
              borderRadius: "24px",
              padding: "40px",
              maxWidth: "448px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/lacanchita-logo.png"
                alt="La Canchita"
                width={120}
                height={100}
                style={{ height: "auto", width: "auto" }}
                fetchPriority="high"
              />
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "16px" }}>
              <div style={{ width: "10px", height: "10px", background: "#10b981", borderRadius: "50%", animation: "splash-bounce 1s infinite 0ms" }} />
              <div style={{ width: "10px", height: "10px", background: "#10b981", borderRadius: "50%", animation: "splash-bounce 1s infinite 200ms" }} />
              <div style={{ width: "10px", height: "10px", background: "#10b981", borderRadius: "50%", animation: "splash-bounce 1s infinite 400ms" }} />
            </div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: `@keyframes splash-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}` }} />
        </div>

        <AuthProvider>
          <Header />

          <div className="pb-24 md:pb-0">
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