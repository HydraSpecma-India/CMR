import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CMR Platform", template: "%s · CMR Platform" },
  description: "CMR consignment note automation and document template designer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
