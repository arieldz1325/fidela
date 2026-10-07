import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import {
  API_URL, DocumentStatus, DocumentSummary, DraftResponse, NewUser, TrackResponse, UploadResponse, User, VersionInfo,
} from './api.models';

export interface UploadRequest {
  files: File[];
  clientName: string;
  clientEmail: string;
  sourceLanguage: string;
  targetLanguage: string;
  notes: string;
}

export interface ReviewBody {
  document: unknown;
  review: unknown;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);

  // ---------- Public ----------

  /** Emits upload progress events, then the response. */
  upload(request: UploadRequest): Observable<HttpEvent<UploadResponse>> {
    const form = new FormData();
    request.files.forEach(file => form.append('files', file, file.name));
    form.append('client_name', request.clientName);
    form.append('client_email', request.clientEmail);
    form.append('source_language', request.sourceLanguage);
    form.append('target_language', request.targetLanguage);
    form.append('notes', request.notes);
    return this.http.post<UploadResponse>(`${API_URL}/uploads`, form, { reportProgress: true, observe: 'events' });
  }

  track(reference: string, email: string): Promise<TrackResponse> {
    const params = new HttpParams().set('email', email);
    return firstValueFrom(this.http.get<TrackResponse>(`${API_URL}/uploads/${encodeURIComponent(reference)}`, { params }));
  }

  myDocuments(): Promise<TrackResponse[]> {
    return firstValueFrom(this.http.get<TrackResponse[]>(`${API_URL}/my/documents`));
  }

  // ---------- Translators & managers ----------

  list(status?: DocumentStatus): Promise<DocumentSummary[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return firstValueFrom(this.http.get<DocumentSummary[]>(`${API_URL}/documents`, { params }));
  }

  claim(id: string): Promise<DocumentSummary> {
    return firstValueFrom(this.http.post<DocumentSummary>(`${API_URL}/documents/${id}/claim`, {}));
  }

  retry(id: string): Promise<DocumentSummary> {
    return firstValueFrom(this.http.post<DocumentSummary>(`${API_URL}/documents/${id}/process`, {}));
  }

  draft(id: string): Promise<DraftResponse> {
    return firstValueFrom(this.http.get<DraftResponse>(`${API_URL}/documents/${id}/draft`));
  }

  saveReview(id: string, body: ReviewBody): Promise<VersionInfo> {
    return firstValueFrom(this.http.put<VersionInfo>(`${API_URL}/documents/${id}/review`, body));
  }

  approve(id: string, body: ReviewBody): Promise<VersionInfo> {
    return firstValueFrom(this.http.post<VersionInfo>(`${API_URL}/documents/${id}/approve`, body));
  }

  /** Emails the client asking for a better photo or scan. */
  requestClearerCopy(id: string, message: string): Promise<{ detail: string }> {
    return firstValueFrom(this.http.post<{ detail: string }>(`${API_URL}/documents/${id}/request-clearer-copy`, { message }));
  }

  reopen(id: string): Promise<DocumentSummary> {
    return firstValueFrom(this.http.post<DocumentSummary>(`${API_URL}/documents/${id}/reopen`, {}));
  }

  // ---------- Managers ----------

  users(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${API_URL}/users`));
  }

  createUser(user: NewUser): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${API_URL}/users`, user));
  }
}
