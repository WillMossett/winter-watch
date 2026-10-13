export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="8" fill="var(--accent)" />
      <path d="M8 18.5 17 11l9 7.5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 17v7h12v-7" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M6 27.5c2.2 0 2.2-1.4 4.4-1.4s2.2 1.4 4.4 1.4 2.2-1.4 4.4-1.4 2.2 1.4 4.4 1.4 2.2-1.4 4.4-1.4" fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
    </svg>
  );
}
