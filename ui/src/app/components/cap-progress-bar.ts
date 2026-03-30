import { Component, input, computed } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-cap-progress-bar',
  imports: [MatTooltipModule],
  template: `
    <div
      class="cap-bar"
      [class.vertical]="orientation() === 'vertical'"
      [class.horizontal]="orientation() === 'horizontal'"
      [style.width]="orientation() === 'horizontal' ? width() : null"
      [matTooltip]="tooltip()"
    >
      @if (label()) {
        <span class="cap-label">{{ label() }}</span>
      }
      <div class="cap-track" [style.height]="orientation() === 'horizontal' ? height() : null">
        <div
          class="cap-fill"
          [class.ok]="status() === 'ok'"
          [class.warning]="status() === 'warning'"
          [class.at-cap]="status() === 'at_cap'"
          [class.over-cap]="status() === 'over_cap'"
          [style.--fill-pct]="clampedPct() + '%'"
        ></div>
        @if (centerLabel()) {
          <span class="cap-center-label">{{ centerLabel() }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    .cap-bar {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cap-bar.horizontal {
      flex-direction: row;
    }

    .cap-bar.horizontal .cap-track {
      flex: 1;
    }

    .cap-bar.horizontal .cap-fill {
      height: 100%;
      width: var(--fill-pct);
    }

    .cap-bar.vertical {
      flex-direction: column;
      width: 20px;
      height: 100%;
    }

    .cap-bar.vertical .cap-track {
      flex: 1;
      width: 100%;
    }

    .cap-bar.vertical .cap-fill {
      width: 100%;
      height: var(--fill-pct);
      position: absolute;
      bottom: 0;
      left: 0;
    }

    .cap-label {
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .cap-track {
      position: relative;
      background: var(--mat-sys-surface-container-highest);
      border-radius: 4px;
      overflow: hidden;
    }

    .cap-center-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      font-weight: 600;
      color: #fff;
      pointer-events: none;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7), 0 0 6px rgba(0, 0, 0, 0.3);
      white-space: nowrap;
    }

    .cap-fill {
      border-radius: 4px;
      transition: width 0.3s ease, height 0.3s ease;
    }

    .cap-fill.ok { background: #2e7d32; }
    .cap-fill.warning { background: #43a047; }
    .cap-fill.at-cap { background: #66bb6a; }
    .cap-fill.over-cap { background: #66bb6a; }
  `],
})
export class CapProgressBarComponent {
  pct = input(0);
  status = input<'ok' | 'warning' | 'at_cap' | 'over_cap'>('ok');
  orientation = input<'horizontal' | 'vertical'>('horizontal');
  label = input('');
  centerLabel = input('');
  tooltip = input('');
  width = input('100px');
  height = input('20px');

  clampedPct = computed(() => Math.min(this.pct(), 100));
}
