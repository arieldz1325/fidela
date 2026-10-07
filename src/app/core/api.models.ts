import { FielDocument } from '../fiel-document/fiel-document.model';

/** Base URL of the Fidela API (fidelaapi repo). */
export const API_URL = 'http://localhost:8000';

export type Role = 'client' | 'translator' | 'manager';

export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'in_review' | 'approved' | 'failed';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface UploadResponse {
  reference: string;
  status: DocumentStatus;
  files: number;
}

export interface TrackResponse {
  reference: string;
  status: DocumentStatus;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentSummary {
  id: string;
  reference: string;
  client_name: string;
  client_email: string;
  source_language: string;
  target_language: string;
  notes: string;
  status: DocumentStatus;
  page_count: number;
  error: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  files: string[];
}

export interface DraftResponse {
  document_id: string;
  reference: string;
  status: DocumentStatus;
  version: number;
  document: FielDocument;
  review: SavedReview | null;
}

/** Review state saved next to the corrected document (see EditorStore.reviewPayload). */
export interface SavedReview {
  approved?: boolean;
  verified?: string[];
  edited?: string[];
  overlays?: unknown[];
  cellImages?: Record<string, unknown>;
  pageBackground?: unknown;
}

export interface VersionInfo {
  version: number;
  kind: 'ai_draft' | 'review' | 'approved';
  created_at: string;
  created_by_name: string | null;
}

/** Without a password the API emails an invitation link to choose one. */
export interface NewUser {
  email: string;
  full_name: string;
  role: Role;
}

/** Wording shown to clients and staff for each status. */
export const STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Received',
  processing: 'Preparing draft',
  ready: 'Ready for translator',
  in_review: 'In review',
  approved: 'Approved',
  failed: 'Needs attention',
};

/** The message from an API error response, or a sensible fallback. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const response = error as { status?: number; error?: { detail?: unknown } };
  if (response?.status === 0) return 'Cannot reach the server. Check your connection and try again.';
  const detail = response?.error?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}
