export function total(whole, standard, open, hopper) {
  const values = [whole, standard, open, hopper];
  if (values.some(v => v === '' || v === null || !Number.isFinite(Number(v)) || Number(v) < 0) || !Number.isInteger(Number(whole)) || Number(standard) <= 0) throw new Error('Jumlah tidak valid');
  return Number(whole) * Number(standard) + Number(open) + Number(hopper);
}
export function matchesMixing(name) { return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === 'mixing wip ok'; }
