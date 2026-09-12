import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Despensa Inteligente",
  description:
    "Fotografía tus tickets y deja que la app aprenda qué compras, qué consumes y qué necesitarás.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-neutral-50 text-neutral-900 min-h-dvh">
        {children}
      </body>
    </html>
  );
}
