import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Sticky, StickyTag } from '../models';

export interface ListStickiesOptions {
  scope?: string;
  status?: 'open' | 'checked' | 'archived' | 'all';
  include_children?: boolean;
  limit?: number;
}

export interface CreateStickyInput {
  title: string;
  body?: string | null;
  scope?: string;
  parent_id?: string | null;
  color?: string | null;
  due_at?: string | null;
  notify_enabled?: boolean;
  notify_offset_n?: number | null;
  notify_offset_unit?: 'min' | 'hour' | 'day' | 'month' | null;
  pinned?: boolean;
  tags?: StickyTag[];
}

@Injectable({ providedIn: 'root' })
export class StickiesService {
  private http = inject(HttpClient);

  list(opts: ListStickiesOptions = {}) {
    const p = new URLSearchParams();
    if (opts.scope) p.set('scope', opts.scope);
    if (opts.status) p.set('status', opts.status);
    if (opts.include_children) p.set('include_children', 'true');
    if (opts.limit != null) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return this.http.get<Sticky[]>(`/api/stickies${qs ? `?${qs}` : ''}`);
  }

  create(data: CreateStickyInput) {
    return this.http.post<Sticky>('/api/stickies', data);
  }

  update(id: string, data: Partial<CreateStickyInput>) {
    return this.http.patch<Sticky>(`/api/stickies/${id}`, data);
  }

  check(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/check`, {}); }
  uncheck(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/uncheck`, {}); }
  pin(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/pin`, {}); }
  unpin(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/unpin`, {}); }
  archive(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/archive`, {}); }
  unarchive(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/unarchive`, {}); }
  detach(id: string) { return this.http.post<Sticky>(`/api/stickies/${id}/detach`, {}); }
  reorder(id: string, position: number) { return this.http.post<Sticky>(`/api/stickies/${id}/reorder`, { position }); }
  setTags(id: string, tags: StickyTag[]) { return this.http.put<Sticky>(`/api/stickies/${id}/tags`, { tags }); }
  remove(id: string) { return this.http.delete(`/api/stickies/${id}`); }
  grab(scope?: string) { return this.http.get<Sticky>(`/api/stickies/grab${scope ? `?scope=${scope}` : ''}`); }
}
