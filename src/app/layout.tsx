import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import ReactQueryProvider from "@/components/providers/ReactQueryProvider";
import SessionProvider from "@/components/providers/SessionProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StoryScribe",
  description: "AI-powered transcription and summarization for D&D sessions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased bg-slate-50`}>
        <SessionProvider>
          <ReactQueryProvider>
            <div className="min-h-screen">
              <Navbar />
              <main className="max-w-[1280px] mx-auto px-8 py-8">
                {children}
              </main>
            </div>
          </ReactQueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
