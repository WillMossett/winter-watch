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
  started: 'MiCasa Stays: You are signed up for free storm alerts for your Lake Huron shoreline home. About 6-12 texts per winter. Msg & data rates may apply. Reply STOP to cancel, HELP for help.',
  stopped: 'MiCasa Stays: You are unsubscribed from storm alerts and will not get more texts. Reply STORM to sign up again.',
  help: 'MiCasa Stays Winter Watch: storm alerts for shoreline homes. Reply CHECK to request a home check, STOP to cancel. Questions: info@micasastays.com',
  check: (price: number) => `MiCasa Stays: Got it. We will call you to schedule a storm check of your home ($${Math.round(price)}, no contract). Reply STOP to cancel alerts.`,
};
