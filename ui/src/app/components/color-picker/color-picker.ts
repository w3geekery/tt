import { Component, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => ColorPickerComponent),
    multi: true,
  }],
  template: `
    <div class="picker-row">
      <input type="color" [value]="value || '#00bcd4'" (input)="onInput($event)" class="color-input">
      @if (value) {
        <button mat-icon-button type="button" (click)="clear()">
          <mat-icon>close</mat-icon>
        </button>
      }
      @if (hasEyeDropper) {
        <button mat-icon-button type="button" (click)="pickFromScreen()">
          <mat-icon>colorize</mat-icon>
        </button>
      }
    </div>
  `,
  styles: `
    .picker-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .color-input {
      width: 40px;
      height: 32px;
      border: none;
      padding: 0;
      cursor: pointer;
      background: transparent;
    }
  `,
})
export class ColorPickerComponent implements ControlValueAccessor {
  value = '';
  hasEyeDropper = 'EyeDropper' in globalThis;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(val: string): void { this.value = val ?? ''; }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  onInput(e: Event): void {
    this.value = (e.target as HTMLInputElement).value;
    this.onChange(this.value);
    this.onTouched();
  }

  clear(): void {
    this.value = '';
    this.onChange('');
    this.onTouched();
  }

  async pickFromScreen(): Promise<void> {
    try {
      const dropper = new (globalThis as any).EyeDropper();
      const result = await dropper.open();
      this.value = result.sRGBHex;
      this.onChange(this.value);
    } catch { /* user cancelled */ }
  }
}
