// Small pure helpers shared by the server and tests.

const SUFFIX: Record<string, string> = {
  STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', AVENUE: 'AVE', LANE: 'LN', COURT: 'CT', BOULEVARD: 'BLVD',
  PLACE: 'PL', TRAIL: 'TRL', HIGHWAY: 'HWY', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  CIRCLE: 'CIR', TERRACE: 'TER', PARKWAY: 'PKWY',
};

export function normAddr(s: string | null | undefined): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => SUFFIX[w] ?? w)
    .join(' ');
}

export function addrKey(address: string | null | undefined, zip?: string | null): string {
  return normAddr(address) + '|' + String(zip ?? '').trim().slice(0, 5);
}

export function titleCase(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE = /^[A-Z0-9]{1,4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export function isCode(s: string): boolean {
  return CODE_RE.test(s);
}

export function normalizeCode(s: string | null | undefined): string {
  return String(s ?? '').toUpperCase().replace(/\s+/g, '').replace(/^([A-Z0-9]{1,4})([23456789A-Z]{4})$/, '$1-$2');
}

export function randomCode(prefix: string): string {
  const p = (prefix || 'WW').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'WW';
  let c = p + '-';
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

// US numbers to E.164 (+1XXXXXXXXXX). Returns null when it cannot be a valid US mobile number.
export function toE164(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.startsWith('+')) {
    const d = '+' + s.slice(1).replace(/\D/g, '');
    return /^\+\d{10,15}$/.test(d) ? d : null;
  }
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return null;
  return '+1' + d;
}

export function prettyPhone(e164: string | null | undefined): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 ?? ''));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 ?? '');
}

export function isEntity(name: string): boolean {
  return /\b(LLC|INC|TRUST|CORP|COMPANY|LP|LTD|ESTATE|PARTNERSHIP)\b/i.test(name);
}

// SMS segment estimate: GSM-7 is 160 chars (153 when split); anything else is 70 (67).
export function smsSegments(text: string): { chars: number; segments: number; gsm: boolean } {
  const gsm = /^[\n\r\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
  const n = text.length;
  const per = gsm ? (n > 160 ? 153 : 160) : n > 70 ? 67 : 70;
  return { chars: n, segments: Math.max(1, Math.ceil(n / per)), gsm };
}

export function money(n: number | string | null | undefined): string {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

export function pct(a: number, b: number): string {
  return b ? ((a / b) * 100).toFixed(1) + '%' : '—';
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d);
  if (isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Detroit' });
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return String(d);
  return x.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });
}

export function todayDetroit(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
