import { FielDocument, FielDocumentEntry } from './fiel-document.model';

/** Loads a document.json and turns its page image paths into absolute URLs. */
export async function loadFielDocument(path: string): Promise<FielDocument> {
  const url = new URL(path, document.baseURI);
  const doc = (await fetchJson(url)) as FielDocument;
  if (!Array.isArray(doc.pages) || !doc.pages.length) {
    throw new Error(`${path} has no pages`);
  }
  return {
    ...doc,
    pages: doc.pages.map(page => ({ ...page, image: new URL(page.image, url).href })),
  };
}

/** The list of processed documents (index.json written by gem_json.py). */
export async function loadDocumentIndex(path: string): Promise<FielDocumentEntry[]> {
  const url = new URL(path, document.baseURI);
  const entries = (await fetchJson(url)) as FielDocumentEntry[];
  // Entry paths are relative to index.json.
  return entries.map(entry => ({ ...entry, path: new URL(entry.path, url).href }));
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status})`);
  return response.json();
}
