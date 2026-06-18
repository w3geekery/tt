import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, signal, ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownViewComponent } from './markdown-view.component';
import { MarkdownEditorComponent } from './markdown-editor.component';

@Component({
  selector: 'app-markdown-note-editor',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MarkdownViewComponent, MarkdownEditorComponent],
  template: `
    @if (editing()) {
      <div class="edit-mode">
        <app-markdown-editor
          [content]="editContent"
          [height]="height"
          (contentChange)="editContent = $event"
        />
        <div class="edit-actions">
          <button mat-button (click)="cancelEdit()">Cancel</button>
          <button mat-button color="primary" (click)="saveEdit()">Save</button>
        </div>
      </div>
    } @else {
      <div class="view-mode" [class.icon-mode]="editTrigger === 'icon'" (click)="onViewClick()">
        @if (notes) {
          <app-markdown-view [content]="notes" />
        } @else {
          <span class="placeholder">{{ placeholder }}</span>
        }
        <button type="button" class="edit-hint-btn" (click)="penClick($event)" title="Edit">
          <mat-icon class="edit-hint">edit</mat-icon>
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .view-mode {
      position: relative;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      border: 1px solid transparent;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    /* In icon-mode, the body is read/selectable; only the pen enters edit. */
    .view-mode.icon-mode {
      cursor: text;
      user-select: text;
    }

    .view-mode:hover {
      border-color: var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-lowest);
    }

    .view-mode:hover .edit-hint-btn,
    .view-mode.icon-mode .edit-hint-btn { opacity: 0.7; }

    .edit-hint-btn {
      position: absolute;
      top: 2px;
      right: 2px;
      padding: 2px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: 0;
      line-height: 0;
      transition: opacity 0.15s ease;
    }

    .edit-hint {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: inherit;
    }

    .placeholder {
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
      font-style: italic;
      opacity: 0.7;
    }

    .edit-mode { margin-top: 8px; }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 4px;
      margin-top: 4px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownNoteEditorComponent {
  @ViewChild(MarkdownEditorComponent) editor?: MarkdownEditorComponent;

  @Input() notes: string = '';
  @Input() height: string = '180px';
  @Input() placeholder: string = 'Click to add notes…';
  /** 'body' (default): click anywhere to edit. 'icon': only the pen enters edit; body stays selectable. */
  @Input() editTrigger: 'body' | 'icon' = 'body';

  @Output() notesChanged = new EventEmitter<string>();

  readonly editing = signal(false);
  editContent = '';

  onViewClick(): void {
    if (this.editTrigger === 'body') this.startEdit();
  }

  penClick(event: Event): void {
    event.stopPropagation();
    this.startEdit();
  }

  startEdit(): void {
    this.editContent = this.notes || '';
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    const markdown = this.editor?.getMarkdown() ?? this.editContent;
    this.notesChanged.emit(markdown.trim());
    this.editing.set(false);
  }
}
