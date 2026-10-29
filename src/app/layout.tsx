import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { SITE_NAME } from "@/config";
import { loadSettings } from "@/lib/settings-store";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

export async function generateMetadata(): Promise<Metadata> {
  await loadSettings();
  return {
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    description: "What our game group plays, loves, and should play next.",
    // Link previews land on the sign-in page, so they'd say "Sign in" without this
    openGraph: { title: SITE_NAME, siteName: SITE_NAME },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e4a3b" },
    { media: "(prefers-color-scheme: dark)", color: "#121614" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
