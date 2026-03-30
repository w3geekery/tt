import {
  Component, Input, ChangeDetectionStrategy,
  signal, computed, inject,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-markdown-view',
  standalone: true,
  template: `<div class="markdown-body" [innerHTML]="renderedHtml()"></div>`,
  styleUrl: './markdown-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownViewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly _content = signal('');

  @Input({ required: true })
  set content(value: string) { this._content.set(value || ''); }

  readonly renderedHtml = computed<SafeHtml>(() => {
    const md = this._content();
    if (!md) return '';
    const html = marked.parse(md, { async: false }) as string;
    const clean = DOMPurify.sanitize(html, {
      ADD_TAGS: ['input'],
      ADD_ATTR: ['type', 'checked', 'disabled'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  });
}
