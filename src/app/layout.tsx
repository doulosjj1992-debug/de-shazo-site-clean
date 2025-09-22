import './globals.css';

export const metadata = {
  title: 'DeShazo Group',
  description: 'DeShazo Group website',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
