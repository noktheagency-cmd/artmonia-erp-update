import type { Metadata } from "next";
import "./globals.css";
import "./mobile-responsive.css";
import "./responsive-controls.css";
import "./dark-mode.css";
import "./app-version.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppNotifications } from "@/components/ui/app-notifications";
import { CrudSubmissionGuard } from "@/components/crud-submission-guard";
import { AppVersionNotice } from "@/components/app-version-notice";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const themeInitScript = `
  (function () {
    try {
      var key = "artmonia-theme:v1";
      var stored = localStorage.getItem(key);
      var theme = stored === "dark" || stored === "light"
        ? stored
        : "light";
      var root = document.documentElement;
      root.classList.toggle("dark", theme === "dark");
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    } catch (_) {}
  })();
`;

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
    <html
      lang="az"
      className={cn("font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <AppNotifications />
        <CrudSubmissionGuard />
        <AppVersionNotice />
      </body>
    </html>
  );
}
