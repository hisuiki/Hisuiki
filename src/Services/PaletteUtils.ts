/**
 * Recolors the accent/text/surface CSS custom properties from the current wallpaper, holding every
 * derived color to its WCAG minimum and reporting the scrim a too-bright photo needs.
 */

// Roles are checked against the near-black chrome they sit on, not against the wallpaper.
const DARK_CHROME_LUMINANCE = 0.02;

// Brightest background white text can sit on and still clear AA: (1.05) / (L + 0.05) = 4.5.
const MAX_UNSCRIMMED_LUMINANCE = 0.1833;

// The same solve at 3:1, applied to the brightest region. Holding a bright patch to full AA would
// darken the rest of the photo to protect a sky; app.scss's text-shadow carries the remainder.
const MAX_PEAK_LUMINANCE = 0.3;

// Cells per axis for the regional luminance measurement. A mean alone cannot see a photo that is
// dark overall but bright exactly where the chrome sits.
const LUMINANCE_GRID = 6;

// Extra darkening on top of the WCAG solve, for photos that need any scrim at all. The minimums
// clear the ratio but still read washed out under the low-contrast text tiers.
const SCRIM_BOOST = 0.1;

// Which cell to design for, sorted dark to bright. Short of the brightest, so a lone specular
// highlight can't dim the whole photo, but high enough to see a genuinely bright quadrant.
const LUMINANCE_PERCENTILE = 0.97;

export interface PaletteSample {
  hue: number;
  saturation: number;
  /** Mean relative luminance across the whole photo. */
  luminance: number;
  /** Relative luminance of its brightest regions, per the two constants above. */
  peakLuminance: number;
}

export function setCssVars(vars: Record<string, string>): void {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) root.setProperty(key, value);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function luminanceChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * luminanceChannel(r / 255) +
    0.7152 * luminanceChannel(g / 255) +
    0.0722 * luminanceChannel(b / 255)
  );
}

const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const m = l - c / 2;
  const r = Math.round((rgb[0] + m) * 255);
  const g = Math.round((rgb[1] + m) * 255);
  const b = Math.round((rgb[2] + m) * 255);
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return { hex, r, g, b };
}

const hsl = (hue: number, saturation: number, lightness: number): string =>
  hslToRgb(hue, saturation, lightness).hex;

/**
 * Nudges `lightness` up until the color clears `minContrast`. Needed because hues do not reach the
 * same luminance at equal lightness — blues read darker than yellows.
 */
function ensureContrast(
  hue: number,
  saturation: number,
  lightness: number,
  backgroundLuminance: number,
  minContrast: number
): string {
  let l = lightness;
  for (let i = 0; i < 30; i++) {
    const { hex, r, g, b } = hslToRgb(hue, saturation, l);
    if (contrastRatio(relativeLuminance(r, g, b), backgroundLuminance) >= minContrast || l >= 0.97) {
      return hex;
    }
    l += 0.02;
  }
  return hslToRgb(hue, saturation, l).hex;
}

function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The whole palette shares one hue and varies only in saturation/lightness, so recoloring is a
// matter of swapping the hue through this same ramp.
function buildPaletteVars(hue: number, intensity: number): Record<string, string> {
  const scale = (base: number) => clamp(base * (0.6 + 0.4 * intensity), 0.15, 0.85);

  // Non-text usage only, so the 3:1 UI-component minimum applies rather than 4.5:1.
  const accent = ensureContrast(hue, scale(0.68), 0.6, DARK_CHROME_LUMINANCE, 3.0);
  // Doubles as link-hover text, so it needs the 4.5:1 text minimum.
  const accentStrong = ensureContrast(hue, scale(0.72), 0.69, DARK_CHROME_LUMINANCE, 4.5);
  const secondary = ensureContrast(hue, scale(0.64), 0.88, DARK_CHROME_LUMINANCE, 4.5);

  return {
    "--color-accent": accent,
    "--color-accent-strong": accentStrong,
    "--color-accent-soft": toRgba(accent, 0.16),
    // Unused as foreground text, so no contrast bar to hold it to.
    "--color-accent-muted": hsl(hue, scale(0.49), 0.44),
    "--color-text-secondary": secondary,
    "--color-text-muted": ensureContrast(hue, scale(0.4), 0.73, DARK_CHROME_LUMINANCE, 4.5),
    // The least prominent tier, held to 3:1 so it stays distinct from Muted/Secondary.
    "--color-text-faint": ensureContrast(hue, scale(0.25), 0.53, DARK_CHROME_LUMINANCE, 3.0),
    // Modal background and scrollbar track: dark and desaturated, but still hue-tinted.
    "--color-surface": hsl(hue, clamp(scale(0.2), 0.05, 0.22), 0.1),
    // The footer's panel. More saturated than Surface since it sits over the photo, not the
    // chrome. The alpha is load-bearing for the footer text's contrast — don't lower it.
    "--color-surface-veil": toRgba(hsl(hue, scale(0.6), 0.118), 0.55),
    // Structural roles stay distinct from text: controls use the full 3:1 accent while quiet table
    // separators use a translucent secondary without pretending to be readable copy.
    "--color-outline": accentStrong,
    "--color-separator": toRgba(secondary, 0.32),
  };
}

/**
 * Scrim opacity white text needs over this wallpaper: the stronger of the mean clearing 4.5:1 and
 * the brightest region clearing 3:1. Assumes the flat alpha composite .wallpaper-scrim does.
 */
function computeScrimOpacity(meanLuminance: number, peakLuminance: number): number {
  const forMean =
    meanLuminance <= MAX_UNSCRIMMED_LUMINANCE ? 0 : 1 - MAX_UNSCRIMMED_LUMINANCE / meanLuminance;
  const forPeak =
    peakLuminance <= MAX_PEAK_LUMINANCE ? 0 : 1 - MAX_PEAK_LUMINANCE / peakLuminance;

  const needed = Math.max(forMean, forPeak);
  if (needed === 0) return 0;

  // never quite opaque — some photo should stay visible
  return clamp(needed + SCRIM_BOOST, 0, 0.82);
}

/**
 * Measures an already-loaded image. Split out so the wallpaper's own <img> can be sampled in
 * place: re-requesting the URL from script would be a separate cache entry in a different CORS
 * mode.
 */
function samplePixels(img: HTMLImageElement, sampleSize: number): PaletteSample | null {
  try {
    const scale = Math.min(1, sampleSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sumSin = 0;
    let sumCos = 0;
    let weight = 0;
    let sumLuminance = 0;
    let opaqueCount = 0;

    // Per-cell luminance, for the regional peak the scrim is designed against.
    const cells = LUMINANCE_GRID * LUMINANCE_GRID;
    const cellLuminance = new Float64Array(cells);
    const cellCount = new Uint32Array(cells);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 128) continue; // skip transparent pixels
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      // Unlike the hue vote below, every opaque pixel counts toward brightness.
      const pixelLuminance =
        0.2126 * luminanceChannel(r) + 0.7152 * luminanceChannel(g) + 0.0722 * luminanceChannel(b);
      sumLuminance += pixelLuminance;
      opaqueCount++;

      const pixel = i >> 2;
      const column = Math.min(
        LUMINANCE_GRID - 1,
        ((pixel % canvas.width) * LUMINANCE_GRID / canvas.width) | 0
      );
      const row = Math.min(
        LUMINANCE_GRID - 1,
        (((pixel / canvas.width) | 0) * LUMINANCE_GRID / canvas.height) | 0
      );
      const cell = row * LUMINANCE_GRID + column;
      cellLuminance[cell] = cellLuminance[cell]! + pixelLuminance;
      cellCount[cell] = cellCount[cell]! + 1;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l < 0.08 || l > 0.92) continue; // skip near-black/near-white
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (s < 0.15) continue; // skip near-neutral pixels

      let h: number;
      if (d === 0) h = 0;
      else if (max === r) h = 60 * ((((g - b) / d) % 6 + 6) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);

      const rad = (h * Math.PI) / 180;
      sumSin += Math.sin(rad) * s;
      sumCos += Math.cos(rad) * s;
      weight += s;
    }

    if (opaqueCount === 0) return null;
    const luminance = sumLuminance / opaqueCount;

    // Only cells that saw an opaque pixel: an empty cell must not count as black.
    const regions: number[] = [];
    for (let cell = 0; cell < cellCount.length; cell++) {
      if (cellCount[cell]! > 0) regions.push(cellLuminance[cell]! / cellCount[cell]!);
    }
    regions.sort((a, b) => a - b);

    const peakLuminance =
      regions.length > 0
        ? regions[Math.min(regions.length - 1, Math.round(LUMINANCE_PERCENTILE * (regions.length - 1)))]!
        : luminance;

    if (weight === 0) {
      // Greyscale photo: no hue to report, but the luminance still matters.
      return { hue: 0, saturation: 0, luminance, peakLuminance };
    }

    let hue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    return {
      hue,
      saturation: Math.min(1, weight / (data.length / 4)),
      luminance,
      peakLuminance,
    };
  } catch {
    // getImageData throws SecurityError on a CORS-tainted canvas.
    return null;
  }
}

/**
 * Samples the wallpaper's hue, mean luminance and regional peak luminance. Pass a loaded <img> to
 * measure it in place, or a URL to fetch a copy. Resolves null rather than rejecting on any
 * failure, so the caller can fall back to the static CSS palette.
 */
export function extractDominant(
  source: string | HTMLImageElement,
  sampleSize = 48
): Promise<PaletteSample | null> {
  if (typeof source !== "string") return Promise.resolve(samplePixels(source, sampleSize));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onerror = () => resolve(null);
    img.onload = () => resolve(samplePixels(img, sampleSize));

    img.src = source;
  });
}

// Stops a slow sample from overwriting the palette of a wallpaper swapped in after it.
let generation = 0;

/**
 * Recolors the custom properties from `source` and returns the scrim opacity it calls for, or null
 * if it could not be sampled. Safe to call concurrently: only the most recent sample is applied.
 * Showing the photo is Wallpaper.tsx's job, not this one's.
 */
export async function applyPaletteFrom(source: string | HTMLImageElement): Promise<number | null> {
  const current = ++generation;

  const sample = await extractDominant(source);
  if (!sample || current !== generation) return null;

  setCssVars(buildPaletteVars(sample.hue, sample.saturation));

  return computeScrimOpacity(sample.luminance, sample.peakLuminance);
}
