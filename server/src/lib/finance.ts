export function toMoney(value: string | number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Math.round(numeric * 100) / 100;
}

export function assertPositiveMoney(value: number) {
  return Number.isFinite(value) && value > 0;
}
