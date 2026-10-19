import 'server-only';

// Thin client for Sendblue's REST API. Credentials stay on the server (environment variables).
export function sendblueConfigured(): boolean {
  return Boolean(process.env.SENDBLUE_API_KEY_ID && process.env.SENDBLUE_API_SECRET && process.env.SENDBLUE_FROM_NUMBER && process.env.SENDBLUE_FROM_NUMBER !== '+1');
}

export type SendResult = { ok: boolean; handle?: string; status?: string; error?: string };

// preReplyOverride: on an inbound-first (AI Agent) line, lets one message a day through to someone who
// has not texted yet, e.g. a visit report link to an owner who only filled in the web form.
export async function sendText(to: string, content: string, statusCallback?: string, opts?: { preReplyOverride?: boolean; mediaUrl?: string }): Promise<SendResult> {
  if (!sendblueConfigured()) return { ok: false, error: 'Sendblue is not set up' };
  const base = (process.env.SENDBLUE_API_BASE || 'https://api.sendblue.co').replace(/\/$/, '');
  try {
    const res = await fetch(base + '/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': process.env.SENDBLUE_API_KEY_ID!,
        'sb-api-secret-key': process.env.SENDBLUE_API_SECRET!,
      },
      body: JSON.stringify({
        number: to,
        from_number: process.env.SENDBLUE_FROM_NUMBER,
        content,
        ...(statusCallback ? { status_callback: statusCallback } : {}),
        ...(opts?.preReplyOverride ? { pre_reply_override: true } : {}),
        ...(opts?.mediaUrl ? { media_url: opts.mediaUrl } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.status === 'ERROR' || body.status === 'DECLINED') {
      return { ok: false, status: String(body.status ?? res.status), error: String(body.error_message ?? body.error_reason ?? body.message ?? `HTTP ${res.status}`) };
    }
    return { ok: true, handle: body.message_handle ? String(body.message_handle) : undefined, status: body.status ? String(body.status) : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export function webhookUrl(kind: 'receive' | 'status'): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  return `${site}/api/sendblue/webhook?token=${encodeURIComponent(process.env.SENDBLUE_WEBHOOK_TOKEN || '')}&kind=${kind}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { sleep };
