import './globals.css';

export const metadata = {
  title: 'Codek Hub Dashboard',
  description: 'Professional management dashboard for Codek Hub.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
