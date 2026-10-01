import AppSidebar from "@/components/AppSidebar";
import Navbar from "@/components/Navbar";
import MonitoringBootstrap from "@/components/MonitoringBootstrap";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Smart JobHub - Find Your Dream Job or Hire the Best Talent",
  description:
    "Connect with opportunities that match your skills and aspirations. Whether you're looking for your next career move or building your dream team, Smart JobHub makes it simple and effective.",
  keywords:
    "jobs, careers, employment, hiring, recruitment, job search, job posting",
  authors: [{ name: "Smart JobHub Team" }],
  openGraph: {
    title: "Smart JobHub - Find Your Dream Job or Hire the Best Talent",
    description:
      "Connect with opportunities that match your skills and aspirations.",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plusJakarta.variable} suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body
        className={`${plusJakarta.className} min-h-screen bg-background text-foreground antialiased`}
      >
        <Suspense fallback={null}>
          <MonitoringBootstrap />
        </Suspense>
        <Navbar />
        <div className="flex min-h-[calc(100vh-4rem)]">
          <AppSidebar />
          <main className="min-h-[calc(100vh-4rem)] flex-1">{children}</main>
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            className:
              "!rounded-2xl !border !border-border !bg-card !text-foreground !shadow-2xl !shadow-foreground/10 !px-4 !py-3 !text-sm !font-medium !backdrop-blur-md dark:!shadow-black/40",
            style: {
              maxWidth: "min(100vw - 2rem, 28rem)",
            },
            success: {
              duration: 3200,
              iconTheme: {
                primary: "#34d399",
                secondary: "currentColor",
              },
            },
            error: {
              duration: 4800,
              iconTheme: {
                primary: "#fb7185",
                secondary: "currentColor",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
