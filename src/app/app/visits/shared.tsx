export const REPORT_LABEL: Record<string, [string, string]> = {
  none: ['No report', ''],
  waiting: ['Waiting for you', 'no'],
  approved: ['Sending', ''],
  sent: ['Texted', 'ok'],
  failed: ['Text failed', 'no'],
  held: ['Held', ''],
  no_phone: ['No phone on file', 'no'],
};

export function ReportChip({ s }: { s: string }) {
  const [label, cls] = REPORT_LABEL[s] ?? [s, ''];
  return <span className={`chip ${cls}`}>{label}</span>;
}
