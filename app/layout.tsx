import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canchita",
  description: "Organiza partidos de fútbol",
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
          </div>

          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}