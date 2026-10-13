import 'server-only';
import { db } from './db';

export const STAGES = [
  ['responded', 'Responded'],
  ['alerts', 'Storm alerts only'],
  ['walkthrough', 'Walkthrough booked'],
  ['client', 'Client'],
  ['lost', 'Not interested'],
] as const;
export type Stage = (typeof STAGES)[number][0];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES);

export const RESPONSE_TYPES = [
  ['call', 'Phone call'],
  ['scan', 'QR code scan'],
  ['form', 'Web form'],
  ['email', 'Email'],
  ['text', 'Text message'],
  ['inperson', 'In person'],
  ['referral', 'Referral'],
] as const;
export const EVENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(RESPONSE_TYPES),
  note: 'Note', stage: 'Stage change', alerts: 'Storm alerts', check: 'Storm check request', edit: 'Details edited', mail: 'Mailed',
};
export const TIERS = ['Essential', 'Standard', 'Premium', 'White Glove'] as const;

// The mailing that most recently reached this household on or before the response date.
export async function attributeMailing(code: string, at: Date): Promise<string | null> {
  const day = at.toISOString().slice(0, 10);
  const rows = await db()<{ id: string }[]>`
    select m.id from ww.mailing_recipients r join ww.mailings m on m.id = r.mailing_id
    where r.code = ${code} and m.status = 'sent' and m.sent_date <= ${day}::date
    order by m.sent_date desc, m.created_at desc limit 1`;
  return rows[0]?.id ?? null;
}

export type ResponseInput = {
  code: string;
  type: string;
  at?: Date;
  note?: string | null;
  by?: string | null;
  mailingId?: string | null | 'auto';
  stageIfNew?: Stage;
  meta?: Record<string, unknown>;
};

// Logs a response event and starts the household's lead if it does not have one yet.
export async function recordResponse(input: ResponseInput): Promise<{ mailingId: string | null; created: boolean }> {
  const sql = db();
  const at = input.at ?? new Date();
  const mailingId = input.mailingId === 'auto' || input.mailingId === undefined ? await attributeMailing(input.code, at) : input.mailingId;
  const stage = input.stageIfNew ?? 'responded';
  return sql.begin(async (tx) => {
    await tx`insert into ww.events (code, at, type, mailing_id, note, by_email, meta)
      values (${input.code}, ${at}, ${input.type}, ${mailingId}, ${input.note ?? null}, ${input.by ?? null}, ${tx.json((input.meta ?? {}) as never)})`;
    const ins = await tx`insert into ww.leads (code, stage, first_response_at, first_response_type, first_mailing_id, assignee, reached)
      values (${input.code}, ${stage}, ${at}, ${input.type}, ${mailingId}, ${input.by ?? null}, ${tx.json({ [stage]: at.toISOString().slice(0, 10) })})
      on conflict (code) do update set updated_at = now()
      returning (xmax = 0) as created`;
    return { mailingId, created: Boolean(ins[0]?.created) };
  });
}

export async function setStage(code: string, stage: Stage, by: string, extra?: { tier?: string | null; value?: number }) {
  const sql = db();
  const day = new Date().toISOString().slice(0, 10);
  await sql.begin(async (tx) => {
    const cur = await tx<{ stage: string }[]>`select stage from ww.leads where code = ${code} for update`;
    if (!cur[0] || cur[0].stage === stage) return;
    await tx`update ww.leads set stage = ${stage}, reached = reached || ${tx.json({ [stage]: day })}, updated_at = now() where code = ${code}`;
    const label = STAGE_LABEL[stage] + (stage === 'client' && extra?.tier ? ` · ${extra.tier} · $${Math.round(extra.value ?? 0).toLocaleString('en-US')}/yr` : '');
    await tx`insert into ww.events (code, type, note, by_email) values (${code}, 'stage', ${'Moved to ' + label}, ${by})`;
  });
}
