'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { parseCSV } from '@/lib/csv';
import { importHouseholds, type ImportRow, type ImportResult } from '../../actions';

type FieldKey = keyof ImportRow | 'owner_first' | 'owner_last' | 'owner2_first' | 'owner2_last';
const FIELDS: [FieldKey, string, RegExp][] = [
  ['code', 'Existing code (keep printed codes)', /^code$|^householdcode$|^responsecode$/],
  ['owner', 'Owner full name', /^(owner1?)?(full)?name$|^owner1?fullname$|^ownername1?$|^owner$|^owner1name$/],
  ['owner_first', 'Owner first name', /^owner1?firstname$|^firstname$|^owner1first$/],
  ['owner_last', 'Owner last name', /^owner1?lastname$|^lastname$|^owner1last$/],
  ['owner2', 'Owner 2 full name', /^owner2(full)?name$|^ownername2$/],
  ['owner2_first', 'Owner 2 first name', /^owner2firstname$/],
  ['owner2_last', 'Owner 2 last name', /^owner2lastname$/],
  ['prop_address', 'Property street address', /^(property|site|situs)?(street)?address$|^propertyaddress1?$|^address1$/],
  ['prop_city', 'Property city', /^(property|site|situs)?city$/],
  ['prop_state', 'Property state', /^(property|site|situs)?state$/],
  ['prop_zip', 'Property ZIP', /^(property|site|situs)?zip(code)?$|^(property)?postalcode$/],
  ['mail_address', 'Mailing street address', /^mail(ing)?(street)?address1?$|^owner(mailing)?address$/],
  ['mail_city', 'Mailing city', /^mail(ing)?city$|^ownercity$/],
  ['mail_state', 'Mailing state', /^mail(ing)?state$|^ownerstate$/],
  ['mail_zip', 'Mailing ZIP', /^mail(ing)?zip(code)?$|^ownerzip$/],
  ['apn', 'Parcel number (APN)', /^apn$|parcel/],
  ['owner_type', 'Owner type', /^ownertype$|^ownershiptype$|corporateowned/],
  ['prop_type', 'Property type', /^propertytype$|^landuse$/],
  ['beds', 'Bedrooms', /^bed(room)?s?$/],
  ['baths', 'Bathrooms', /^bath(room)?s?$/],
  ['sqft', 'Square feet', /sqft|squarefeet|buildingsize|livingarea/],
  ['year_built', 'Year built', /^yearbuilt$/],
  ['est_value', 'Estimated value', /estvalue|estimatedvalue|^avm|marketvalue/],
  ['last_sale', 'Last sale date', /lastsaledate|^saledate$|lastsold/],
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function guess(headers: string[]): Record<string, number> {
  const used = new Set<number>();
  const map: Record<string, number> = {};
  const n = headers.map(norm);
  for (const [k, , re] of FIELDS) {
    const i = n.findIndex((h, ix) => !used.has(ix) && re.test(h));
    map[k] = i;
    if (i >= 0) used.add(i);
  }
  return map;
}

export function Importer() {
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [source, setSource] = useState('PropStream ' + new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const built = useMemo<ImportRow[]>(() => {
    if (!file) return [];
    const g = (r: string[], k: string) => (map[k] >= 0 ? String(r[map[k]] ?? '').trim() : '');
    return file.rows.map((r) => ({
      code: g(r, 'code') || undefined,
      owner: g(r, 'owner') || [g(r, 'owner_first'), g(r, 'owner_last')].filter(Boolean).join(' '),
      first_name: g(r, 'owner_first') || undefined,
      owner2: g(r, 'owner2') || [g(r, 'owner2_first'), g(r, 'owner2_last')].filter(Boolean).join(' ') || undefined,
      prop_address: g(r, 'prop_address'), prop_city: g(r, 'prop_city'), prop_state: g(r, 'prop_state'), prop_zip: g(r, 'prop_zip'),
      mail_address: g(r, 'mail_address'), mail_city: g(r, 'mail_city'), mail_state: g(r, 'mail_state'), mail_zip: g(r, 'mail_zip'),
      apn: g(r, 'apn'), owner_type: g(r, 'owner_type'), prop_type: g(r, 'prop_type'), beds: g(r, 'beds'), baths: g(r, 'baths'),
      sqft: g(r, 'sqft'), year_built: g(r, 'year_built'), est_value: g(r, 'est_value'), last_sale: g(r, 'last_sale'),
    }));
  }, [file, map]);
  const ready = map.prop_address >= 0 && map.mail_address >= 0 && (map.owner >= 0 || map.owner_first >= 0 || map.owner_last >= 0);
  const usable = built.filter((r) => r.prop_address && r.mail_address).length;

  async function onFile(f: File) {
    setError(''); setResult(null);
    const text = await f.text();
    const rows = parseCSV(text);
    if (rows.length < 2) { setError('That file has no rows to import.'); return; }
    const headers = rows[0].map((h) => h.trim());
    setFile({ name: f.name, headers, rows: rows.slice(1) });
    setMap(guess(headers));
  }

  async function run() {
    const rows = built.filter((r) => r.prop_address && r.mail_address);
    const total = rows.length;
    const sum: ImportResult = { added: 0, dupes: 0, excluded: 0, skipped: built.length - total, keptCodes: 0 };
    setBusy({ done: 0, total });
    try {
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await importHouseholds(rows.slice(i, i + 1000), source);
        if (r.error) throw new Error(r.error);
        sum.added += r.added; sum.dupes += r.dupes; sum.excluded += r.excluded; sum.skipped += r.skipped; sum.keptCodes += r.keptCodes;
        setBusy({ done: Math.min(total, i + 1000), total });
      }
      setResult(sum);
    } catch (e) {
      setError((e instanceof Error ? e.message : 'The import stopped.') + (sum.added ? ` ${sum.added} households were saved before it stopped.` : ''));
      setResult(sum.added ? sum : null);
    } finally {
      setBusy(null);
    }
  }

  if (result) return (
    <div className="stack" style={{ gap: 12 }}>
      {error && <div className="banner bad"><span>{error}</span></div>}
      <div className="banner good"><span><strong>{result.added.toLocaleString()} households added.</strong>{result.keptCodes ? ` ${result.keptCodes} kept their existing codes.` : ''}{result.excluded ? ` ${result.excluded} marked excluded as MiCasa owners.` : ''}{result.dupes ? ` ${result.dupes} duplicates skipped.` : ''}{result.skipped ? ` ${result.skipped} skipped with no address.` : ''}</span></div>
      <div className="row"><Link className="btn primary" href="/app/households">See households</Link><Link className="btn" href="/app/mailings/new">Create a mailing</Link></div>
    </div>
  );
  if (busy) return (
    <div className="stack" style={{ gap: 10 }}><h3>Importing…</h3><div className="progress"><i style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} /></div><p className="muted">{busy.done.toLocaleString()} of {busy.total.toLocaleString()} sent. Keep this page open.</p></div>
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      {error && <div className="banner bad"><span>{error}</span></div>}
      <p>Choose the CSV you exported from PropStream. You match its columns next, and nothing is saved until you confirm. Moving over from the pilot CRM? Use its “Export all” file and match the <strong>code</strong> column, so codes already printed keep working.</p>
      <label className="f" style={{ maxWidth: 420 }}>CSV file<input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} /></label>
      {file && (
        <>
          <h3>Match the columns <span className="muted small" style={{ fontWeight: 500 }}>· {file.name} · {file.rows.length.toLocaleString()} rows</span></h3>
          <div className="fields">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="f">{label}
                <select value={map[k] ?? -1} onChange={(e) => setMap({ ...map, [k]: Number(e.target.value) })}>
                  <option value={-1}>Not in this file</option>
                  {file.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="f" style={{ maxWidth: 420 }}>Source label<input type="text" value={source} onChange={(e) => setSource(e.target.value)} /></label>
          {!ready ? (
            <div className="banner"><span>Match at least the owner name, the property street address and the mailing street address to continue.</span></div>
          ) : (
            <>
              <p><strong>{usable.toLocaleString()}</strong> rows have both addresses. Duplicates and MiCasa owner addresses are handled on import.</p>
              <div className="table-wrap"><table><thead><tr><th>Owner</th><th>Property</th><th>Town</th><th>Mailing address</th></tr></thead>
                <tbody>{built.slice(0, 3).map((r, i) => <tr key={i}><td>{r.owner}</td><td>{r.prop_address}</td><td>{r.prop_city}</td><td>{r.mail_address}, {r.mail_city} {r.mail_state} {r.mail_zip}</td></tr>)}</tbody></table></div>
              <div className="row"><button className="btn primary" onClick={run} disabled={!usable}>Import {usable.toLocaleString()} households</button></div>
            </>
          )}
        </>
      )}
    </div>
  );
}
