import type { Metadata, Viewport } from "next";
import { Montserrat, Inter } from "next/font/google";
import "./globals.css";

// Familias adaptadas del design system de RealMargin (ver tokens.css):
// Inter para cuerpo/componentes, Montserrat para contextos protagonistas
// (títulos de página, título de modal). Las variables van en <html>, no en
// <body>: tokens.css las referencia desde :root, que es <html>.
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
  themeColor: "#5f7f3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} ${inter.variable}`}>
      <body className="antialiased min-h-dvh">
        {children}
      </body>
    </html>
  );
}
