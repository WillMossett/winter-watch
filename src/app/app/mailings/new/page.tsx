import Link from 'next/link';
import { towns } from '@/lib/queries';
import { getSettings } from '@/lib/db';
import { todayDetroit } from '@/lib/text';
import { createMailing } from '../../actions';

export const metadata = { title: 'New mailing' };

export default async function NewMailing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const [tw, settings] = await Promise.all([towns(), getSettings()]);
  return (
    <section className="panel">
      <div className="panel-head"><h2>New mailing</h2><Link className="btn quiet" href="/app/mailings">Cancel</Link></div>
      {sp.error && <div className="banner bad"><span>{sp.error}</span></div>}
      {!tw.length ? <div className="empty"><strong>Import your list first</strong><Link className="btn primary" href="/app/households/import">Import list</Link></div> : (
        <form action={createMailing} className="stack" style={{ gap: 14 }}>
          <div className="fields">
            <label className="f">Name<input type="text" name="name" required defaultValue={'Letter 1 · ' + new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} /></label>
            <label className="f">Piece<select name="kind" defaultValue="letter"><option value="letter">Letter in envelope</option><option value="postcard">Postcard</option></select></label>
            <label className="f">Planned mail date<input type="date" name="planned_date" defaultValue={todayDetroit()} /></label>
            <label className="f">Cost per piece ($)<input type="number" name="cost" step="0.01" min="0" defaultValue={settings.cost_letter} /></label>
            <label className="f">Other costs ($)<input type="number" name="extra" step="1" min="0" defaultValue={0} /></label>
          </div>
          <p className="small muted">Postcards usually cost about ${Number(settings.cost_postcard).toFixed(2)} a piece; change the cost if you pick one.</p>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <legend className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Who gets it</legend>
            <label className="check"><input type="radio" name="audience" value="all" defaultChecked /> Every household that can be mailed</label>
            <label className="check"><input type="radio" name="audience" value="new" /> Only households not mailed yet</label>
            <label className="check"><input type="radio" name="audience" value="noresp" /> Households mailed before that have not responded</label>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Towns</legend>
            <div className="row">{tw.map((t) => <label key={t.town} className="check"><input type="checkbox" name="towns" value={t.town} defaultChecked /> {t.town} ({t.n})</label>)}</div>
          </fieldset>
          <p className="small muted">Clients, households marked not interested, excluded addresses and homes with no mailing address are always left out. You will see the count after it is created, and a draft can be deleted.</p>
          <div><button className="btn primary" type="submit">Create mailing</button></div>
        </form>
      )}
    </section>
  );
}
