import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docencia | Evaluación por parciales",
  description: "Panel docente y aplicación segura de exámenes de Español.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
