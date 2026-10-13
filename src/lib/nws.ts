// National Weather Service alerts for the Thumb shoreline counties.
// County SAME codes: Huron 026063, St. Clair 026147, Sanilac 026151.
export const COUNTIES: Record<string, string> = { '026063': 'Huron', '026147': 'St. Clair', '026151': 'Sanilac' };

// Warnings worth texting seasonal owners about. Advisories are left out on purpose.
export const WATCHED_EVENTS = [
  'Winter Storm Warning', 'Blizzard Warning', 'Ice Storm Warning', 'Extreme Cold Warning', 'Wind Chill Warning',
  'Hard Freeze Warning', 'Freeze Warning', 'High Wind Warning', 'Lakeshore Flood Warning', 'Lake Effect Snow Warning',
];

export type NwsAlert = {
  id: string;
  event: string;
  headline: string;
  ends: string | null;
  counties: string[];
};

type Feature = { properties: Record<string, unknown> };

export function pickAlerts(features: Feature[]): NwsAlert[] {
  const out: NwsAlert[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const event = String(p.event ?? '');
    if (!WATCHED_EVENTS.includes(event)) continue;
    if (p.status && p.status !== 'Actual') continue;
    if (p.messageType === 'Cancel') continue;
    const same = ((p.geocode as { SAME?: string[] } | undefined)?.SAME ?? []).filter((c) => c in COUNTIES);
    if (!same.length) continue;
    out.push({
      id: String(p.id ?? ''),
      event,
      headline: String(p.headline ?? event),
      ends: (p.ends as string) ?? (p.expires as string) ?? null,
      counties: [...new Set(same.map((c) => COUNTIES[c]))],
    });
  }
  return out;
}

function untilText(ends: string | null): string {
  if (!ends) return '';
  const d = new Date(ends);
  if (isNaN(d.getTime())) return '';
  return ' until ' + d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', timeZone: 'America/Detroit' });
}

export function draftMessage(a: NwsAlert, checkPrice: number): string {
  const where = a.counties.length > 1 ? a.counties.slice(0, -1).join(', ') + ' and ' + a.counties.slice(-1) + ' counties' : a.counties[0] + ' County';
  const until = untilText(a.ends);
  const price = `$${Math.round(checkPrice)}`;
  const e = a.event.toLowerCase();
  let risk = 'Storms can knock out power and heat.';
  if (/freeze|cold|chill/.test(e)) risk = 'If your heat fails, pipes can freeze within hours.';
  else if (/ice/.test(e)) risk = 'Ice brings power outages along the shore, and without power the heat stops.';
  else if (/wind/.test(e)) risk = 'Watch for roof, tree and power damage.';
  else if (/flood/.test(e)) risk = 'High water and ice can push onto low lots.';
  else if (/snow|blizzard|winter storm/.test(e)) risk = 'Heavy snow loads roofs and blocks drives, and outages stop the heat.';
  return `MiCasa Storm Alert: ${a.event} for ${where}${until}. ${risk} Want us to check your home after? Reply CHECK (${price}, no contract). Reply STOP to opt out.`;
}

export async function fetchMichiganAlerts(): Promise<Feature[]> {
  const res = await fetch('https://api.weather.gov/alerts/active?area=MI', {
    headers: { 'User-Agent': '(MiCasa Stays Winter Watch, info@micasastays.com)', Accept: 'application/geo+json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('NWS returned ' + res.status);
  const body = (await res.json()) as { features?: Feature[] };
  return body.features ?? [];
}
