/**
 * Vereinslogo (SCRUM-182). Firebase Storage ist im Projekt nicht eingerichtet und die Sicherheitsrichtlinie der Seite
 * (CSP) erlaubt nur Bilder von der eigenen Adresse oder als `data:`-URL. Deshalb wird das Logo im Browser verkleinert und
 * als `data:`-URL direkt im Vereinsdokument `clubs/{clubId}` (Feld `logoUrl`) gespeichert.
 *
 * Größenbegrenzung: höchstens {@link LOGO_MAX_CHARS} Zeichen (≈ 75 KB Bilddaten). Ein auf 256 px verkleinertes Logo
 * ist als WebP/PNG meist 10–60 KB groß; die Grenze lässt Luft, hält das Vereinsdokument aber weit unter der
 * Firestore-Grenze von 1 MiB und den Start der App schnell (jedes Teammitglied liest das Dokument beim Öffnen).
 * Dieselbe Grenze und dasselbe Format prüfen die Firestore-Regeln (`clubs/{clubId}`, update).
 */

/** Längste Kante des gespeicherten Logos in Pixeln (Anzeige in der App: höchstens ~40 px, doppelt für scharfe Displays reicht). */
export const LOGO_MAX_EDGE = 256;
/** Höchstlänge der `data:`-URL – identisch mit der Grenze in firestore.rules. */
export const LOGO_MAX_CHARS = 100_000;
/** Größte Datei, die überhaupt eingelesen wird (vor dem Verkleinern). */
export const LOGO_INPUT_MAX_BYTES = 5 * 1024 * 1024;
/** Erlaubte Dateitypen beim Hochladen. */
export const LOGO_INPUT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Gleiches Muster wie in firestore.rules: nur PNG, JPEG oder WebP, base64. */
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Ist das ein gespeichertes Logo, das die App anzeigen darf (und die Regeln annehmen)? */
export function isLogoDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LOGO_MAX_CHARS && LOGO_PATTERN.test(value);
}

/** Logo aus der Datenbank nur übernehmen, wenn es ein zulässiges Bild ist (ältere Einträge, fremde Adressen → kein Logo). */
export function logoFromDoc(value: unknown): string | null {
  return isLogoDataUrl(value) ? value : null;
}

/** Fehlertext für eine ausgewählte Datei, leer = in Ordnung. */
export function logoFileProblem(file: Pick<File, 'type' | 'size'>): string {
  if (!LOGO_INPUT_TYPES.includes(file.type)) return 'Bitte ein Bild als PNG, JPG oder WebP auswählen.';
  if (file.size > LOGO_INPUT_MAX_BYTES) return 'Die Datei ist zu groß (höchstens 5 MB).';
  return '';
}

/** Zielgröße: Seitenverhältnis bleibt, längste Kante höchstens `max`, nie vergrößern. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Ein Versuch beim Verkleinern: Kante, Format, Qualität. */
export interface LogoAttempt {
  readonly edge: number;
  readonly type: 'image/webp' | 'image/png' | 'image/jpeg';
  readonly quality?: number;
}

/**
 * Reihenfolge der Versuche: erst groß und mit Transparenz (WebP, PNG), dann kleiner, zuletzt JPEG auf weißem Grund
 * (ohne Transparenz). Der erste Versuch unter der Grenze gewinnt.
 */
export const LOGO_ATTEMPTS: readonly LogoAttempt[] = [256, 192, 128, 96].flatMap((edge) => [
  { edge, type: 'image/webp' as const, quality: 0.9 },
  { edge, type: 'image/png' as const },
  { edge, type: 'image/webp' as const, quality: 0.75 },
  { edge, type: 'image/jpeg' as const, quality: 0.85 },
]);

/** Zeichnet das Bild für einen Versuch und liefert die `data:`-URL (Browser: Canvas). */
export type LogoEncoder = (attempt: LogoAttempt) => string;

/**
 * Probiert die Versuche der Reihe nach und liefert das erste zulässige Logo. Ein Browser, der kein WebP schreiben kann,
 * liefert stattdessen PNG – das Ergebnis wird deshalb immer am tatsächlichen Format geprüft.
 */
export function pickLogo(encode: LogoEncoder, attempts: readonly LogoAttempt[] = LOGO_ATTEMPTS): string | null {
  for (const attempt of attempts) {
    const url = encode(attempt);
    if (isLogoDataUrl(url)) return url;
  }
  return null;
}

/** Liest die Datei als `data:`-URL (ein `blob:`-Bild würde die CSP blockieren). */
function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Bild konnte nicht geöffnet werden.'));
    image.src = src;
  });
}

/**
 * Verkleinert eine ausgewählte Bilddatei zu einem speicherbaren Logo. Wirft einen Fehler mit verständlichem Text, wenn
 * die Datei nicht passt oder auch klein noch zu groß ist.
 */
export async function shrinkLogo(file: File): Promise<string> {
  const problem = logoFileProblem(file);
  if (problem) throw new Error(problem);
  const image = await loadImage(await readAsDataUrl(file));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Dieses Gerät kann das Bild nicht verkleinern.');
  const logo = pickLogo((attempt) => {
    const size = fitWithin(image.naturalWidth, image.naturalHeight, attempt.edge);
    canvas.width = size.width;
    canvas.height = size.height;
    context.clearRect(0, 0, size.width, size.height);
    if (attempt.type === 'image/jpeg') {
      // JPEG kennt keine Transparenz: weißer Grund statt schwarzer Ecken.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    return canvas.toDataURL(attempt.type, attempt.quality);
  });
  if (!logo) throw new Error('Das Bild ist auch verkleinert noch zu groß. Bitte ein einfacheres Logo wählen.');
  return logo;
}
