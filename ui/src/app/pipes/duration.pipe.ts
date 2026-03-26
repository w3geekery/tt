import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'duration', standalone: true })
export class DurationPipe implements PipeTransform {
  transform(ms: number | null | undefined, format: 'hm' | 'hms' | 'decimal' = 'hm'): string {
    if (ms == null || ms < 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    switch (format) {
      case 'hms':
        return `${h}:${pad(m)}:${pad(s)}`;
      case 'decimal':
        return (ms / 3600000).toFixed(2) + 'h';
      default:
        return `${h}:${pad(m)}`;
    }
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
