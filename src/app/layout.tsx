import type { Metadata } from "next";
import "./globals.css";
import "./mobile-responsive.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppNotifications } from "@/components/ui/app-notifications";
import { CrudSubmissionGuard } from "@/components/crud-submission-guard";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Artmonia ERP",
  description: "Education ERP for Artmonia studio operations.",
  applicationName: "Artmonia ERP",
  icons: {
    icon: [
      {
        url: "/artmonia-favicon-32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: "/artmonia-favicon-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/artmonia-favicon-32.png",
    apple: [
      {
        url: "/artmonia-favicon-180.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="az" className={cn("font-sans", geist.variable)}>
      <body>
        {children}
        <AppNotifications />
        <CrudSubmissionGuard />
      </body>
    </html>
  );
}
