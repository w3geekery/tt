import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private snack = inject(MatSnackBar);

  show(message: string, duration = 2500): void {
    this.snack.open(message, undefined, {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }

  action(message: string, actionLabel: string, duration = 4000) {
    return this.snack.open(message, actionLabel, {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}
