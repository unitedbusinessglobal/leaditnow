import type { ReactNode } from "react";

export const metadata = {
  title: "LeadItNow",
  description: "Find businesses that run on Zoho and work them from first contact to signed MSA.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#F7F7FB",
          color: "#1C2040",
        }}
      >
        {children}
      </body>
    </html>
  );
}
