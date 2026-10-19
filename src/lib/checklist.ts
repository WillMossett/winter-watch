// The visit checklist. Shared by the field app (phone) and the server (reports), so no server-only imports.

export type VisitKind = 'weekly' | 'storm' | 'photo' | 'walkthrough' | 'extra';
export type ItemKind = 'check' | 'temp';
export type Result = 'ok' | 'issue' | 'na';

export type Item = { key: string; label: string; section: string; kind: ItemKind; hint?: string };
export type PhotoSlot = { key: string; label: string };
export type Template = { items: Item[]; photos: PhotoSlot[] };

export type Answer = { key: string; label: string; section: string; kind: ItemKind; result: Result | null; note?: string; value?: number | null };

export const KIND_LABEL: Record<VisitKind, string> = {
  weekly: 'Weekly visit',
  storm: 'Storm check',
  photo: 'Free photo',
  walkthrough: 'Walkthrough',
  extra: 'Extra visit',
};

const OUTSIDE: Item[] = [
  { key: 'ext_doors', label: 'Doors locked, no signs of entry', section: 'Outside', kind: 'check' },
  { key: 'ext_windows', label: 'Windows and glass intact', section: 'Outside', kind: 'check' },
  { key: 'ext_roof', label: 'Roof, gutters, no ice dams', section: 'Outside', kind: 'check' },
  { key: 'ext_snow', label: 'Snow and ice on roof, decks, walks', section: 'Outside', kind: 'check' },
  { key: 'ext_damage', label: 'No storm or tree damage', section: 'Outside', kind: 'check' },
  { key: 'ext_mail', label: 'No mail, packages or flyers left out', section: 'Outside', kind: 'check' },
];

const INSIDE: Item[] = [
  { key: 'int_temp', label: 'Thermostat reading', section: 'Heat', kind: 'temp', hint: 'Degrees showing on the thermostat' },
  { key: 'int_heat', label: 'Furnace running, heat coming out', section: 'Heat', kind: 'check' },
  { key: 'int_floors', label: 'No water on floors, ceilings or walls', section: 'Water', kind: 'check' },
  { key: 'int_sinks', label: 'Under every sink dry', section: 'Water', kind: 'check' },
  { key: 'int_run', label: 'Faucets run, toilets flushed', section: 'Water', kind: 'check' },
  { key: 'int_heater', label: 'Water heater dry, no leaks', section: 'Water', kind: 'check' },
  { key: 'int_sump', label: 'Sump pump working, basement dry', section: 'Water', kind: 'check' },
  { key: 'int_power', label: 'Power on, fridge and freezer running', section: 'Inside', kind: 'check' },
  { key: 'int_alarms', label: 'No smoke or CO alarm chirping', section: 'Inside', kind: 'check' },
  { key: 'int_pests', label: 'No pests, odors or mold', section: 'Inside', kind: 'check' },
];

const FULL_PHOTOS: PhotoSlot[] = [
  { key: 'ph_front', label: 'Front of house' },
  { key: 'ph_thermo', label: 'Thermostat' },
  { key: 'ph_sink', label: 'Under kitchen sink' },
  { key: 'ph_utility', label: 'Basement or utility area' },
  { key: 'ph_heater', label: 'Water heater' },
];

const OUTSIDE_PHOTOS: PhotoSlot[] = [
  { key: 'ph_front', label: 'Front of house' },
  { key: 'ph_roof', label: 'Roof and gutters' },
  { key: 'ph_entry', label: 'Doors and entry' },
];

// Free photo visits are outside only (no key). Everything else is a full inside-and-out check.
export function templateFor(kind: VisitKind, extraItems: string[] = []): Template {
  const extras: Item[] = extraItems
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((label, i) => ({ key: `home_${i}`, label, section: 'This home', kind: 'check' as const }));
  if (kind === 'photo') return { items: OUTSIDE, photos: OUTSIDE_PHOTOS };
  return { items: [...OUTSIDE, ...INSIDE, ...extras], photos: FULL_PHOTOS };
}

export function blankAnswers(t: Template): Answer[] {
  return t.items.map((i) => ({ key: i.key, label: i.label, section: i.section, kind: i.kind, result: null, note: '', value: null }));
}

// What still has to be done before a visit can be finished. Empty list = ready.
export function missingFor(answers: Answer[], t: Template, photoKeys: string[]): string[] {
  const out: string[] = [];
  const unanswered = answers.filter((a) => (a.kind === 'temp' ? a.value == null && a.result !== 'na' : a.result == null));
  if (unanswered.length) out.push(`${unanswered.length} checklist item${unanswered.length === 1 ? '' : 's'}`);
  const noNote = answers.filter((a) => a.result === 'issue' && !String(a.note ?? '').trim());
  if (noNote.length) out.push(`a note for ${noNote.length} issue${noNote.length === 1 ? '' : 's'}`);
  const have = new Set(photoKeys);
  const photos = t.photos.filter((p) => !have.has(p.key));
  if (photos.length) out.push(photos.map((p) => p.label.toLowerCase()).join(', ') + ' photo' + (photos.length === 1 ? '' : 's'));
  return out;
}

// A thermostat set below 50°F in a Michigan winter is treated as an issue even if the tech forgot to flag it.
export const LOW_TEMP_F = 50;

export function hasIssue(answers: Answer[]): boolean {
  return answers.some((a) => a.result === 'issue' || (a.kind === 'temp' && a.value != null && a.value < LOW_TEMP_F));
}

export function issuesSummary(answers: Answer[]): string[] {
  return answers
    .filter((a) => a.result === 'issue' || (a.kind === 'temp' && a.value != null && a.value < LOW_TEMP_F))
    .map((a) => (a.kind === 'temp' && a.value != null && a.value < LOW_TEMP_F && a.result !== 'issue'
      ? `Thermostat reads ${a.value}°F`
      : `${a.label}${a.note ? `: ${a.note}` : ''}`));
}
