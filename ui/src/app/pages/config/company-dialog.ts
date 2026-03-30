import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { ColorPickerComponent } from '../../components/color-picker';
import { Company } from '../../models';

export interface CompanyDialogData {
  mode: 'create' | 'edit';
  company?: Company;
}

@Component({
  selector: 'app-company-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, ColorPickerComponent],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Add Company' : 'Edit Company' }}</h2>
    <mat-dialog-content>
      <mat-form-field class="dialog-field">
        <mat-label>Name</mat-label>
        <input matInput [(ngModel)]="name" required />
      </mat-form-field>
      <label class="color-label">Color</label>
      <app-color-picker [(ngModel)]="color" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!name" (click)="save()">
        {{ data.mode === 'create' ? 'Create' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    '.dialog-field { width: 100%; margin-bottom: 8px; }',
    '.color-label { font-size: 12px; color: var(--mat-sys-on-surface-variant); display: block; margin-bottom: 4px; }',
  ],
})
export class CompanyDialogComponent {
  name: string;
  color: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: CompanyDialogData,
    private ref: MatDialogRef<CompanyDialogComponent>,
  ) {
    this.name = data.company?.name ?? '';
    this.color = data.company?.color ?? '';
  }

  save() {
    this.ref.close({
      name: this.name,
      color: this.color || null,
    });
  }
}
