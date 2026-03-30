import { Injectable, signal } from '@angular/core';
import { User } from '../models';

/**
 * Stub auth service — tt is local-first, no authentication needed.
 * Always returns a logged-in user so auth-checking components work.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>({
    id: 'local',
    username: 'clark',
    avatar_url: null,
  });
  readonly loading = signal(false);

  checkSession() {
    // No-op — always logged in
  }

  login() {
    // No-op
  }

  logout() {
    // No-op
  }
}
