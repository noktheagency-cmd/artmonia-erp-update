import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Artmonia ERP",
  description: "Education ERP for Artmonia studio operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
