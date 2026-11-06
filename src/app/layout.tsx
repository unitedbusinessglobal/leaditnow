import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "LeadItNow",
  description: "Find businesses that need software or IT services and work them from first contact to signed MSA.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
