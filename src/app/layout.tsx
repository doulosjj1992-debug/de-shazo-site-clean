import './globals.css'
import type { Metadata } from "next";
import Link from "next/link";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "DeShazo Group - Traffic Engineering & Transportation Planning",
  description:
    "Professional traffic engineering and transportation planning services with over 45 years of experience.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b">
          <div className="container mx-auto max-w-7xl px-4 flex items-center justify-between py-4">
            <Link href="/" className="font-semibold">
              DeShazo Group
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/projects">Projects</Link>
              <Link href="/services">Services</Link>
              <Link href="/team">Team</Link>
              <Link href="/news">News</Link>
              <Link href="/contact">Contact</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t">
          <div className="container mx-auto max-w-7xl px-4 py-8 text-sm text-gray-600">
            © {new Date().getFullYear()} DeShazo Group. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
