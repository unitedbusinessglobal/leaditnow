import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "LeadItNow — AI lead discovery and pipeline for software services",
  description: "Find businesses that need software or IT services, see the evidence, and work them from first contact to signed MSA. An AInformatIQ product.",
  icons: { icon: "/favicon.svg" },
};

// Apply the saved theme before first paint (shared key across AInformatIQ products).
const themeScript = `try{var t=localStorage.getItem("ainformatiq-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
