// Plan prices shown to owners. Keep in step with the printed service sheet.
export const PLANS = [
  { name: 'Essential', winter: 229, summer: 49, blurb: 'Visit every 2 weeks' },
  { name: 'Standard', winter: 299, summer: 79, blurb: 'Weekly + storm checks', recommended: true },
  { name: 'Premium', winter: 379, summer: 99, blurb: 'Weekly + leak sensors' },
  { name: 'White Glove', winter: 699, summer: 199, blurb: 'Twice weekly, all in' },
] as const;
