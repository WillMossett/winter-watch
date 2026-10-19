import { db, getSettings } from '@/lib/db';
import { requireMember } from '@/lib/auth';
import { sendblueConfigured, webhookUrl } from '@/lib/sendblue';
import { TIERS } from '@/lib/leads';
import { prettyPhone } from '@/lib/text';
import { addTeamMember, removeTeamMember, saveExclusions, saveSettings, sendTestText } from '../actions';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; excluded?: string; tested?: string }> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const sql = db();
  const [s, team, excl] = await Promise.all([
    getSettings(),
    sql<{ email: string; name: string | null; role: string }[]>`select email, name, role from ww.team_members order by role, email`,
    sql<{ address: string }[]>`select address from ww.exclusions order by address`,
  ]);
  const owner = me.role === 'owner';
  const connected = sendblueConfigured();
  return (
    <>
      {sp.saved && <div className="banner good"><span>Settings saved.</span></div>}
      {sp.tested && <div className="banner good"><span>Test text sent. Check your phone.</span></div>}
      {sp.excluded !== undefined && <div className="banner good"><span>MiCasa owner list saved. {sp.excluded} household{sp.excluded === '1' ? '' : 's'} on the list marked as excluded.</span></div>}
      {sp.error && <div className="banner bad"><span>{sp.error}</span></div>}

      <form action={saveSettings} className="stack">
        <section className="panel">
          <div className="panel-head"><h2>Codes and printing</h2>{!owner && <p>Only owners can change these.</p>}</div>
          <fieldset disabled={!owner} style={{ border: 0, padding: 0, margin: 0 }} className="fields">
            <label className="f">Scan page address<input type="text" name="site_url" defaultValue={s.site_url} /></label>
            <label className="f">Web address printed on mail<input type="text" name="print_url" defaultValue={s.print_url} /></label>
            <label className="f">Code prefix<input type="text" name="code_prefix" maxLength={4} defaultValue={s.code_prefix} /></label>
            <label className="f">Letter cost per piece ($)<input type="number" step="0.01" min="0" name="cost_letter" defaultValue={s.cost_letter} /></label>
            <label className="f">Postcard cost per piece ($)<input type="number" step="0.01" min="0" name="cost_postcard" defaultValue={s.cost_postcard} /></label>
          </fieldset>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Plans and prices</h2><p>Annual value fills in when a client&apos;s plan is chosen.</p></div>
          <fieldset disabled={!owner} style={{ border: 0, padding: 0, margin: 0 }} className="fields">
            {TIERS.map((t) => <label key={t} className="f">{t} ($/yr)<input type="number" min="0" step="1" name={'tier_' + t} defaultValue={s.tier_values[t] ?? 0} /></label>)}
            <label className="f">One-off storm check ($)<input type="number" min="0" step="1" name="check_price" defaultValue={s.check_price} /></label>
          </fieldset>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Texting</h2><p>{connected ? 'Sendblue is connected.' : 'Sendblue is not connected yet.'}</p></div>
          <fieldset disabled={!owner} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <label className="check"><input type="checkbox" name="alerts_enabled" defaultChecked={s.alerts_enabled} /> Allow storm alerts to be sent to subscribers</label>
            <label className="f" style={{ maxWidth: 320 }}>Team phone for weather drafts<input type="tel" name="team_alert_phone" defaultValue={s.team_alert_phone ? prettyPhone(s.team_alert_phone) : ''} placeholder="(810) 555-0100" /></label>
            <p className="small muted">When the Weather Service issues a warning for the shoreline, this phone gets a text asking someone to review the draft.</p>
          </fieldset>
          {connected && <p className="small muted">Sendblue receive webhook: <span className="linkbox">{webhookUrl('receive')}</span></p>}
        </section>
        {owner && <div><button className="btn primary" type="submit">Save settings</button></div>}
      </form>

      {connected && (
        <section className="panel">
          <h2>Send a test text</h2>
          <form action={sendTestText} className="row" style={{ alignItems: 'end' }}>
            <label className="f" style={{ flex: '1 1 220px', maxWidth: 320 }}>Your mobile number<input type="tel" name="phone" required /></label>
            <button className="btn" type="submit">Send test</button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>MiCasa owner addresses</h2><p>{excl.length} saved. These never get the cold mailing.</p></div>
        <form action={saveExclusions} className="stack" style={{ gap: 10 }}>
          <label className="f">One property street address per line<textarea name="exclusions" defaultValue={excl.map((e) => e.address).join('\n')} placeholder="7185 Lakeshore Rd" style={{ minHeight: 160 }} /></label>
          <div><button className="btn" type="submit">Save and apply to the list</button></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Team</h2><p>People who can sign in. Techs only see the field app at /field and sign in with a code texted to their mobile.</p></div>
        <div className="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th></th></tr></thead>
          <tbody>{team.map((t) => <tr key={t.email}><td>{t.email}</td><td>{t.name ?? '—'}</td><td>{t.role === 'owner' ? 'Owner' : t.role === 'tech' ? 'Field tech' : 'Member'}</td><td>{owner && t.email !== me.email && <form action={removeTeamMember.bind(null, t.email)}><button className="btn quiet" type="submit">Remove</button></form>}</td></tr>)}</tbody></table></div>
        {owner && (
          <form action={addTeamMember} className="fields" style={{ alignItems: 'end' }}>
            <label className="f">Email<input type="email" name="email" required /></label>
            <label className="f">Name<input type="text" name="name" /></label>
            <label className="f">Role<select name="role" defaultValue="tech"><option value="tech">Field tech (visits only)</option><option value="member">Member (office app)</option><option value="owner">Owner</option></select></label>
            <label className="f">Mobile<input type="tel" name="phone" placeholder="Required for field techs" /></label>
            <div><button className="btn" type="submit">Add to team</button></div>
          </form>
        )}
      </section>
    </>
  );
}
