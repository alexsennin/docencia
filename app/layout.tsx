import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resultados docentes | Docencia",
  description: "Consulta privada de resultados de exámenes por grupo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
