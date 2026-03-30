import { Component, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-color-picker',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="color-picker-row">
      <input
        type="color"
        [value]="value || '#000000'"
        (input)="onColorInput($event)"
        class="color-input"
      />
      <span class="color-value">{{ value || 'None' }}</span>
      <button mat-icon-button type="button" (click)="openEyeDropper()" title="Pick from screen">
        <mat-icon>colorize</mat-icon>
      </button>
      @if (value) {
        <button mat-icon-button type="button" (click)="clear()" title="Clear color">
          <mat-icon>close</mat-icon>
        </button>
      }
    </div>
  `,
  styles: [`
    .color-picker-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .color-input {
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 4px;
      cursor: pointer;
      background: none;
    }
    .color-input::-webkit-color-swatch-wrapper { padding: 2px; }
    .color-input::-webkit-color-swatch { border: none; border-radius: 2px; }
    .color-value {
      font-family: monospace;
      font-size: 14px;
      min-width: 60px;
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorPickerComponent),
      multi: true,
    },
  ],
})
export class ColorPickerComponent implements ControlValueAccessor {
  value = '';
  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(val: string) {
    this.value = val || '';
  }

  registerOnChange(fn: (val: string) => void) {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }

  onColorInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.value = input.value;
    this.onChange(this.value);
    this.onTouched();
  }

  async openEyeDropper() {
    if (!('EyeDropper' in window)) {
      return;
    }
    try {
      const dropper = new (window as any)['EyeDropper']();
      const result = await dropper.open();
      this.value = result.sRGBHex;
      this.onChange(this.value);
      this.onTouched();
    } catch {
      // User cancelled
    }
  }

  clear() {
    this.value = '';
    this.onChange(this.value);
    this.onTouched();
  }
}
