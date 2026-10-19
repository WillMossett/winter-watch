import { CODE_ALPHABET } from './text.ts';

// Finds a letter code like "WW-7K2M" (also "ww 7k2m" or "WW7K2M") in a text, using the code prefix
// from Settings so ordinary words are never mistaken for a code. Returns the code and the text without it.
export function extractCode(content: string | null | undefined, prefix: string): { code: string | null; rest: string } {
  const text = String(content ?? '');
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return { code: null, rest: text };
  const re = new RegExp(`(^|[^A-Z0-9])${p}\\s*-?\\s*([${CODE_ALPHABET}]{4})(?![A-Z0-9])`, 'i');
  const m = re.exec(text);
  if (!m) return { code: null, rest: text };
  const code = `${p}-${m[2].toUpperCase()}`;
  const rest = (text.slice(0, m.index) + m[1] + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { code, rest };
}

// How an incoming text is handled. Pure function so it can be tested.
export type Keyword = 'stop' | 'start' | 'check' | 'help' | 'other';

export function classifyInbound(content: string | null | undefined): Keyword {
  const t = String(content ?? '').trim().toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ');
  const first = t.split(' ')[0] ?? '';
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'].includes(t) || t === 'OPT OUT' || (first === 'STOP' && t.length <= 12)) return 'stop';
  if (['STORM', 'START', 'JOIN', 'SUBSCRIBE', 'UNSTOP', 'YES', 'ALERTS'].includes(t)) return 'start';
  if (first === 'CHECK' && t.length <= 30) return 'check';
  if (['HELP', 'INFO'].includes(t)) return 'help';
  return 'other';
}

export const REPLIES = {
  photoAndAlerts: 'MiCasa Stays: Thanks! We will stop by your place this week and text you a photo. You are also signed up for free storm alerts, about 6-12 texts per winter. Msg & data rates may apply. Reply STOP to cancel.',
  photoOnly: 'MiCasa Stays: Thanks! We will stop by your place this week and text you a photo. Want free storm alerts too? Reply STORM.',
  started: 'MiCasa Stays: You are signed up for free storm alerts for your Lake Huron shoreline home. About 6-12 texts per winter. Msg & data rates may apply. Reply STOP to cancel, HELP for help.',
  stopped: 'MiCasa Stays: You are unsubscribed from storm alerts and will not get more texts. Reply STORM to sign up again.',
  help: 'MiCasa Stays Winter Watch: storm alerts for shoreline homes. Reply CHECK to request a home check, STOP to cancel. Questions: info@micasastays.com',
  check: (price: number) => `MiCasa Stays: Got it. We will call you to schedule a storm check of your home ($${Math.round(price)}, no contract). Reply STOP to cancel alerts.`,
};
