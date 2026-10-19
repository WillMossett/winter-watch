// Plan prices shown to owners. Keep in step with the printed service sheet.
export const PLANS = [
  { name: 'Essential', winter: 229, summer: 49, blurb: 'Visit every 2 weeks' },
  { name: 'Standard', winter: 299, summer: 79, blurb: 'Weekly + storm checks', recommended: true, regular: 349 },
  { name: 'Premium', winter: 379, summer: 99, blurb: 'Weekly + leak sensors' },
  { name: 'White Glove', winter: 699, summer: 199, blurb: 'Twice weekly, all in' },
] as const;

// The Founding 25 offer (Letter 1, Oct 2026). Values match the published add-on prices.
export const FOUNDING = {
  homes: 25,
  deadline: 'November 15',
  rate: 299,
  regular: 349,
  bonuses: [
    { name: 'Full top-to-bottom check on your first visit', value: 250 },
    { name: 'Spring opening in April', value: 225 },
    { name: 'Heat up and lights on before your first trip back', value: 75 },
    { name: '2 hours meeting your contractors at the house', value: 110 },
    { name: 'Leak + temperature sensor that texts you', note: 'First 10 homes', value: 199 },
  ],
} as const;
