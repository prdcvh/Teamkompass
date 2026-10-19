/** Allgemeine Datumshilfen für ISO-Datum-Texte (JJJJ-MM-TT), die überall in der App genutzt werden. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Alter in vollen Jahren; leer/ungültig → null. */
export function ageFromBirthdate(birthdate: string, now: Date = new Date()): number | null {
  if (!isIsoDate(birthdate)) return null;
  const [year, month, day] = birthdate.split('-').map(Number);
  let age = now.getFullYear() - year;
  const hadBirthday = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return '–';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/** ISO-Datum plus (oder minus) Tage; rechnet in UTC, damit Zeitumstellungen nichts verschieben. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
