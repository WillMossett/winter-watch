import type { Metadata, Viewport } from 'next';
import './field.css';

export const metadata: Metadata = {
  title: 'Field',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Winter Watch', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1D5C86' };

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <div className="fld-root">{children}</div>;
}
