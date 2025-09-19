import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DeShazo Group - Traffic Engineering & Transportation Planning',
  description: 'Professional traffic engineering and transportation planning services with over 45 years of experience.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b">
          <div className="container flex items-center justify-between py-4">
            <a href="/" className="font-semibold">DeShazo Group</a>
            <nav className="flex gap-4 text-sm">
              <a href="/projects">Projects</a>
              <a href="/services">Services</a>
              <a href="/team">Team</a>
              <a href="/news">News</a>
              <a href="/contact">Contact</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t">
          <div className="container py-8 text-sm text-gray-600">
            © {new Date().getFullYear()} DeShazo Group. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
