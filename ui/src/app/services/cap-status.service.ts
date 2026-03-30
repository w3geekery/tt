import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CapStatus } from '../models';

@Injectable({ providedIn: 'root' })
export class CapStatusService {
  constructor(private http: HttpClient) {}

  getCapStatus(date?: string): Observable<CapStatus> {
    const params = date ? `?date=${date}` : '';
    return this.http.get<CapStatus>(`/api/cap-status${params}`);
  }
}
