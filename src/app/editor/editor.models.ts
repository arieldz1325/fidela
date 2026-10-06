import { FielCell, LOW_CONFIDENCE } from '../fiel-document/fiel-document.model';
import { IconName } from './ui/icon';

/** Letter size at 96 dpi. */
export const PAGE_WIDTH = 816;
export const PAGE_HEIGHT = 1056;

export const DRAG_TYPE = 'application/x-fiel-item';
/** Extra marker so drop targets can tell images from text blocks during dragover (data is unreadable then). */
export const ASSET_DRAG_TYPE = 'application/x-fiel-asset';

export type EditorMode = 'review' | 'preview';

export type Selection =
  | { type: 'field'; key: string }
  | { type: 'overlay'; id: string }
  | null;

/** A cell plus its position in the document and the reasons it needs a human look. */
export interface FieldRef {
  key: string;
  /** Page index (0-based) and the page number shown to people. */
  pi: number;
  pageNumber: number;
  si: number;
  ri: number;
  ci: number;
  section: string;
  cell: FielCell;
  issues: string[];
}

export interface Asset {
  id: string;
  name: string;
  src: string;
  /** height / width */
  ratio: number;
  defaultWidth: number;
  builtIn?: boolean;
}

/** An image placed inside a field; the cell grows to fit it instead of overlapping. */
export interface CellImage {
  name: string;
  src: string;
  height: number;
  /** Horizontal position inside the field: 0 = left edge, 100 = right edge. */
  x: number;
  inkBlend: boolean;
  /** Keep the bracketed note (e.g. "[Signature]") under the image. */
  showNote: boolean;
}

export type CropRequest = { target: 'library' } | { target: 'cell'; key: string };

/** Full-page image behind the content, e.g. the translator's letterhead. */
export interface PageBackground {
  name: string;
  src: string;
  opacity: number;
}

interface OverlayBase {
  id: string;
  /** Page index (0-based) the element sits on; x/y are relative to that page. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface ImageOverlay extends OverlayBase {
  type: 'image';
  name: string;
  src: string;
  /** Multiply blend so stamps and signatures look like real ink on paper. */
  inkBlend: boolean;
}

export interface TextOverlay extends OverlayBase {
  type: 'text';
  text: string;
  fontSize: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

export type Overlay = ImageOverlay | TextOverlay;

export type OverlayPatch = Partial<Omit<ImageOverlay, 'id' | 'type' | 'page'>> &
  Partial<Omit<TextOverlay, 'id' | 'type' | 'page'>>;

export type LibraryDragItem = { kind: 'asset'; id: string } | { kind: 'block'; preset: TextPreset };

/** Where the editor finds the documents produced by gem_json.py. */
export const DOCUMENT_INDEX = 'demo/index.json';

export type TextPreset = 'text' | 'note' | 'certification' | 'date';

export const TEXT_PRESETS: Record<TextPreset, { label: string; hint: string; icon: IconName; width: number; fontSize: number; text: () => string }> = {
  text: {
    label: 'Text',
    hint: 'Free text box',
    icon: 'type',
    width: 260,
    fontSize: 12,
    text: () => 'Text',
  },
  note: {
    label: "Translator's note",
    hint: 'Bracketed clarification',
    icon: 'note',
    width: 320,
    fontSize: 10,
    text: () => "[Translator's note: ]",
  },
  certification: {
    label: 'Certification statement',
    hint: 'Competence + accuracy declaration',
    icon: 'shield',
    width: 640,
    fontSize: 11,
    text: () =>
      'CERTIFICATION OF TRANSLATION\n\n' +
      'I, [Translator name], certify that I am competent to translate from Spanish into English, ' +
      'and that the foregoing is a complete and accurate translation of the attached document, ' +
      'to the best of my knowledge and ability.\n\n' +
      `Signature: ______________________          Date: ${today()}`,
  },
  date: {
    label: 'Date',
    hint: "Today's date",
    icon: 'calendar',
    width: 160,
    fontSize: 11,
    text: today,
  },
};

export const SAMPLE_ASSETS: Asset[] = [
  {
    id: 'sample-seal',
    name: 'Sample seal',
    ratio: 1,
    defaultWidth: 140,
    builtIn: true,
    src: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs><path id="ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"/></defs>
        <g fill="none" stroke="#1d4ed8" stroke-width="4">
          <circle cx="100" cy="100" r="95"/><circle cx="100" cy="100" r="57"/>
        </g>
        <text font-family="Arial" font-size="15" font-weight="700" fill="#1d4ed8" letter-spacing="2.5">
          <textPath href="#ring">CERTIFIED TRANSLATOR · SAMPLE SEAL ·</textPath>
        </text>
        <text x="100" y="97" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#1d4ed8">ES → EN</text>
        <text x="100" y="120" text-anchor="middle" font-family="Arial" font-size="11" fill="#1d4ed8">No. 000000</text>
      </svg>`),
  },
  {
    id: 'sample-signature',
    name: 'Sample signature',
    ratio: 1 / 3,
    defaultWidth: 200,
    builtIn: true,
    src: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">
        <path d="M12 72 C 40 8, 64 10, 56 62 S 82 92, 102 50 S 132 18, 142 60 S 172 82, 186 44 C 196 22, 214 30, 206 62 S 244 76, 292 30"
              fill="none" stroke="#0f172a" stroke-width="3.2" stroke-linecap="round"/>
      </svg>`),
  },
];

export function fieldKey(pi: number, si: number, ri: number, ci: number): string {
  return `${pi}.${si}.${ri}.${ci}`;
}

export function fieldIssues(cell: FielCell): string[] {
  const issues: string[] = [];
  const value = cell.value;

  if (cell.confidence < LOW_CONFIDENCE) {
    issues.push(`Low AI confidence (${Math.round(cell.confidence * 100)}%)`);
  }
  if (cell.note) {
    issues.push(cell.note);
  }
  if (cell.kind === 'annotation' && !value?.translated?.trim()) {
    issues.push('Element has no bracketed description');
  }
  if (
    value && !value.is_literal && cell.kind !== 'annotation' &&
    value.original.trim() && value.original.trim() === value.translated.trim() &&
    /\p{L}{3,}/u.test(value.original)
  ) {
    issues.push('Value may be untranslated');
  }
  return issues;
}

export function fieldTitle(cell: FielCell): string {
  if (cell.label?.translated) return cell.label.translated;
  if (cell.kind === 'annotation') return humanize(cell.annotation_type ?? 'element');
  return humanize(cell.kind);
}

export function fieldPreview(cell: FielCell): string {
  if (cell.kind === 'checkbox') return cell.checked ? 'Checked' : 'Unchecked';
  return cell.value?.translated?.trim() || '—';
}

export function humanize(id: string): string {
  const text = id.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Gemini boxes are [ymin, xmin, ymax, xmax] on a 0-1000 scale. */
export function boxToPercentStyle([ymin, xmin, ymax, xmax]: number[]): Record<string, string> {
  return {
    top: `${ymin / 10}%`,
    left: `${xmin / 10}%`,
    height: `${(ymax - ymin) / 10}%`,
    width: `${(xmax - xmin) / 10}%`,
  };
}

function today(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.trim());
}
