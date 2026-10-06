// Mirrors the JSON returned by gem_json.py (RESPONSE_SCHEMA).

export interface FielText {
  original: string;
  translated: string;
  is_literal: boolean;
}

/** [ymin, xmin, ymax, xmax] normalized 0-1000 over the original image. */
export type Box = number[];

export type CellKind = 'field' | 'text' | 'checkbox' | 'annotation';

export type AnnotationType =
  | 'signature' | 'seal' | 'stamp' | 'fingerprint' | 'photo'
  | 'barcode' | 'qr_code' | 'logo' | 'handwriting' | 'other';

export interface FielCell {
  id: string;
  kind: CellKind;
  width: number;
  label?: FielText | null;
  value?: FielText | null;
  checked?: boolean | null;
  annotation_type?: AnnotationType | null;
  confidence: number;
  box: Box;
  note?: string | null;
}

export interface FielRow {
  cells: FielCell[];
}

export interface FielSection {
  id: string;
  title?: FielText | null;
  box: Box;
  rows: FielRow[];
}

/** One page of the upload; boxes in its cells are relative to `image`. */
export interface FielPage {
  page_number: number;
  orientation: 'portrait' | 'landscape';
  document_title?: FielText | null;
  sections: FielSection[];
  /** Page image URL (relative to document.json in the file, absolute once loaded). */
  image: string;
  image_size?: [number, number];
}

export interface FielDocument {
  source_language: string;
  target_language: string;
  pages: FielPage[];
  source_file?: string;
}

/** An entry of index.json, written by gem_json.py for every processed upload. */
export interface FielDocumentEntry {
  name: string;
  path: string;
  pages: number;
}

export const LOW_CONFIDENCE = 0.85;
