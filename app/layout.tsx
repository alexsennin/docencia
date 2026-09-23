import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docencia | IntegraTech",
  description: "Espacio de trabajo para proyectos de docencia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
