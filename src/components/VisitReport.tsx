import { KIND_LABEL, LOW_TEMP_F, type Answer } from '@/lib/checklist';
import type { ReportPhoto, ReportVisit } from '@/lib/report';

const RESULT: Record<string, [string, string]> = { ok: ['OK', 'ok'], issue: ['Needs attention', 'no'], na: ['N/A', ''] };

function when(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });
}

// The visit as the owner sees it: photos, checklist, notes. Used on the owner's link and in the office.
export function VisitReport({ v, photos, showOfficeNotes = false }: { v: ReportVisit; photos: ReportPhoto[]; showOfficeNotes?: boolean }) {
  const answers = (v.checklist ?? []) as Answer[];
  const sections = [...new Set(answers.map((a) => a.section))];
  const issues = answers.filter((a) => a.result === 'issue' || (a.kind === 'temp' && a.value != null && a.value < LOW_TEMP_F));
  return (
    <div className="vr">
      <div className="vr-head">
        <div className="vr-kind">{KIND_LABEL[v.kind] ?? 'Visit'}</div>
        <h1>{v.address || 'Your home'}</h1>
        <p>{v.city}{v.completed_at ? ` · ${when(v.completed_at)}` : ''}</p>
        <div className={`vr-status ${v.has_issue ? 'bad' : 'good'}`}>{v.has_issue ? `${issues.length || 1} item${issues.length === 1 ? '' : 's'} need${issues.length === 1 ? 's' : ''} attention` : 'All clear'}</div>
      </div>
      {v.report_note && <div className="vr-note"><strong>From MiCasa:</strong> {v.report_note}</div>}
      {photos.length > 0 && (
        <div className="vr-photos">
          {photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="vr-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.label ?? 'Visit photo'} loading="lazy" />
              {p.label && <span>{p.label}</span>}
            </a>
          ))}
        </div>
      )}
      {sections.map((s) => (
        <section key={s} className="vr-sec">
          <h2>{s}</h2>
          <ul>
            {answers.filter((a) => a.section === s).map((a) => {
              const low = a.kind === 'temp' && a.value != null && a.value < LOW_TEMP_F;
              const [label, cls] = a.kind === 'temp' ? (a.value == null ? ['Not read', ''] : [`${a.value}°F`, low ? 'no' : 'ok']) : (RESULT[a.result ?? ''] ?? ['—', '']);
              return (
                <li key={a.key}>
                  <span className="vr-item">{a.label}{a.note && <em>{a.note}</em>}</span>
                  <span className={`chip ${cls}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {v.notes && <section className="vr-sec"><h2>Notes from the visit</h2><p className="vr-notes">{v.notes}</p></section>}
      {showOfficeNotes && v.lat != null && v.lng != null && (
        <p className="small muted">Checked in at <a href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">{v.lat}, {v.lng}</a></p>
      )}
    </div>
  );
}
