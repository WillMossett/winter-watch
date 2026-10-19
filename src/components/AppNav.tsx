'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string][] = [
  ['/app', 'Dashboard'],
  ['/app/households', 'Households'],
  ['/app/pipeline', 'Pipeline'],
  ['/app/visits', 'Visits'],
  ['/app/mailings', 'Mailings'],
  ['/app/responses', 'Responses'],
  ['/app/alerts', 'Storm alerts'],
  ['/app/settings', 'Settings'],
];

export function AppNav({ badges }: { badges?: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map(([href, label]) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        const b = badges?.[href];
        return (
          <Link key={href} href={href} className="tab" aria-current={active ? 'page' : undefined}>
            {label}
            {b ? <span className="chip" style={{ marginLeft: 6, padding: '0 7px' }}>{b}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
