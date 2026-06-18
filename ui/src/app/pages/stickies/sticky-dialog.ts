import { Component, Inject, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MarkdownEditorComponent } from '../../components/markdown-editor.component';
import { Sticky, StickyTag, NotifyOffsetUnit } from '../../models';
import type { CreateStickyInput } from '../../services/stickies.service';
import {
  DEFAULT_STICKY_COLOR, STICKY_SWATCHES, contrastFg, contrastDim,
} from './sticky-contrast';

export { DEFAULT_STICKY_COLOR } from './sticky-contrast';

export interface StickyDialogData {
  sticky?: Sticky;
}

/** What the modal hands back to the board on close. Closing with no changes returns undefined. */
export type StickyDialogResult =
  | { action: 'save'; data: CreateStickyInput }
  | { action: 'archive' }
  | { action: 'delete' };

/** Format a UTC ISO instant as a `datetime-local` value in the browser's local (Pacific) wall time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Keep-style sticky modal. The whole panel is painted the sticky's color; a borderless
 * title + always-on WYSIWYG editor sit above a bottom action bar. Closing auto-saves
 * (opener must pass `disableClose: true` so backdrop/Esc also route through close()).
 */
@Component({
  selector: 'app-sticky-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatDividerModule,
    MarkdownEditorComponent,
  ],
  template: `
    <div
      class="sticky-modal"
      [style.--sticky-bg]="color() || themedBg"
      [style.--sticky-fg]="fg()"
      [style.--sticky-fg-dim]="dim()"
    >
      <div class="modal-head">
        <input
          class="modal-title"
          placeholder="Title"
          [(ngModel)]="title"
          cdkFocusInitial
        />
        <button
          mat-icon-button
          class="pin-btn"
          [class.on]="pinned"
          (click)="pinned = !pinned"
          [matTooltip]="pinned ? 'Unpin' : 'Pin'"
        >
          <mat-icon>push_pin</mat-icon>
        </button>
      </div>

      <app-markdown-editor
        #editor
        class="modal-body"
        [content]="body"
        [hideToolbar]="true"
        height="320px"
      />

      @if (reminderOpen()) {
        <div class="reminder-panel">
          <mat-form-field class="due-field" appearance="outline" subscriptSizing="dynamic">
            <mat-label>Remind (Pacific)</mat-label>
            <input matInput type="datetime-local" [(ngModel)]="dueLocal" />
          </mat-form-field>
          @if (dueLocal) {
            <mat-checkbox [(ngModel)]="notifyEnabled">Notify</mat-checkbox>
            @if (notifyEnabled) {
              <span class="lead">
                <input class="lead-n" type="number" min="1" [(ngModel)]="notifyN" />
                <select class="lead-unit" [(ngModel)]="notifyUnit">
                  <option value="min">min</option>
                  <option value="hour">hours</option>
                  <option value="day">days</option>
                  <option value="month">months</option>
                </select>
                before
              </span>
            }
          }
        </div>
      }

      <div class="labels-row">
        <input class="label-input" placeholder="Scope (repo, blank = global)" [(ngModel)]="scope" />
        <input class="label-input" placeholder="Topics (comma-separated)" [(ngModel)]="topics" />
      </div>

      <div class="action-bar">
        <button mat-button class="ab-btn" [matMenuTriggerFor]="formatMenu" matTooltip="Format">
          <mat-icon>text_format</mat-icon><mat-icon class="caret">arrow_drop_down</mat-icon>
        </button>
        <mat-menu #formatMenu="matMenu">
          <button mat-menu-item (click)="editor.toggleBold()"><mat-icon>format_bold</mat-icon><span>Bold</span></button>
          <button mat-menu-item (click)="editor.toggleItalic()"><mat-icon>format_italic</mat-icon><span>Italic</span></button>
          <button mat-menu-item (click)="editor.toggleStrikethrough()"><mat-icon>strikethrough_s</mat-icon><span>Strikethrough</span></button>
          <button mat-menu-item (click)="editor.toggleHeading(2)"><mat-icon>title</mat-icon><span>Heading</span></button>
          <button mat-menu-item (click)="editor.toggleBulletList()"><mat-icon>format_list_bulleted</mat-icon><span>Bullet list</span></button>
          <button mat-menu-item (click)="editor.toggleTaskList()"><mat-icon>checklist</mat-icon><span>Checklist</span></button>
          <button mat-menu-item (click)="editor.insertLink()"><mat-icon>link</mat-icon><span>Link</span></button>
        </mat-menu>

        <button mat-icon-button class="ab-btn" [matMenuTriggerFor]="colorMenu" matTooltip="Color">
          <mat-icon>palette</mat-icon>
        </button>
        <mat-menu #colorMenu="matMenu" class="swatch-menu">
          <div class="swatch-grid" (click)="$event.stopPropagation()">
            <button
              type="button"
              class="swatch none"
              [class.sel]="!color()"
              matTooltip="None (themed)"
              (click)="pickColor(null)"
            ><mat-icon>format_color_reset</mat-icon></button>
            @for (sw of swatches; track sw.value) {
              <button
                type="button"
                class="swatch"
                [style.background]="sw.value"
                [class.sel]="color() === sw.value"
                [matTooltip]="sw.name"
                (click)="pickColor(sw.value)"
              ></button>
            }
          </div>
        </mat-menu>

        <button mat-icon-button class="ab-btn" [class.on]="reminderOpen()" (click)="toggleReminder()" matTooltip="Reminder">
          <mat-icon>{{ dueLocal ? 'notifications_active' : 'notification_add' }}</mat-icon>
        </button>

        <button mat-icon-button class="ab-btn" [matMenuTriggerFor]="moreMenu" matTooltip="More">
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #moreMenu="matMenu">
          <button mat-menu-item (click)="editor.toggleTaskList()"><mat-icon>check_box</mat-icon><span>Show checkboxes</span></button>
          <button mat-menu-item (click)="copyText()"><mat-icon>content_copy</mat-icon><span>Copy text</span></button>
          @if (data.sticky) {
            <mat-divider />
            <button mat-menu-item (click)="archive()"><mat-icon>archive</mat-icon><span>Archive</span></button>
            <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon><span>Delete</span></button>
          }
        </mat-menu>

        <span class="spacer"></span>

        <button mat-button class="close-btn" (click)="close()">Close</button>
      </div>
    </div>
  `,
  styleUrl: './sticky-dialog.scss',
})
export class StickyDialogComponent {
  @ViewChild('editor') editor?: MarkdownEditorComponent;

  readonly swatches = STICKY_SWATCHES;
  readonly themedBg = '#2a2d3a';

  title = '';
  body = '';
  scope = '';
  topics = '';
  dueLocal = '';
  notifyEnabled = false;
  notifyN = 10;
  notifyUnit: NotifyOffsetUnit = 'min';
  pinned = false;

  readonly color = signal<string | null>(DEFAULT_STICKY_COLOR);
  readonly reminderOpen = signal(false);

  /** Foreground/dim track the chosen color so the panel theming stays readable on any swatch. */
  readonly fg = signal('#1b1b1b');
  readonly dim = signal('rgba(27, 27, 27, 0.6)');

  constructor(
    private ref: MatDialogRef<StickyDialogComponent, StickyDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: StickyDialogData,
    private snack: MatSnackBar,
  ) {
    const s = data.sticky;
    if (s) {
      this.title = s.title;
      this.body = s.body ?? '';
      this.color.set(s.color ?? null);
      this.scope = s.tags.find((t) => t.key === 'scope')?.value ?? '';
      this.topics = s.tags.filter((t) => t.key === 'topic').map((t) => t.value).join(', ');
      this.dueLocal = s.due_at ? toLocalInput(s.due_at) : '';
      this.notifyEnabled = s.notify_enabled;
      this.notifyN = s.notify_offset_n ?? 10;
      this.notifyUnit = s.notify_offset_unit ?? 'min';
      this.pinned = s.pinned;
      this.reminderOpen.set(!!s.due_at);
    }
    this.recolor();

    // Auto-save on every dismissal path (backdrop click, Esc); opener sets disableClose.
    this.ref.backdropClick().subscribe(() => this.close());
    this.ref.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  pickColor(value: string | null): void {
    this.color.set(value);
    this.recolor();
  }

  private recolor(): void {
    const bg = this.color() || this.themedBg;
    this.fg.set(contrastFg(bg));
    this.dim.set(contrastDim(bg));
  }

  toggleReminder(): void {
    this.reminderOpen.update((v) => !v);
    // Default the due field to now (Pacific) the first time the reminder panel opens.
    if (this.reminderOpen() && !this.dueLocal) {
      this.dueLocal = toLocalInput(new Date().toISOString());
    }
  }

  async copyText(): Promise<void> {
    const md = this.editor?.getMarkdown() ?? this.body;
    try {
      await navigator.clipboard.writeText(md);
      this.snack.open('Copied', 'OK', { duration: 1500 });
    } catch {
      // Clipboard unavailable (insecure context / permissions) — silent, non-critical.
    }
  }

  archive(): void {
    this.ref.close({ action: 'archive' });
  }

  remove(): void {
    if (!confirm(`Delete "${this.title || 'this sticky'}"? This can't be undone.`)) return;
    this.ref.close({ action: 'delete' });
  }

  /** Build the save payload and close. Empty title = nothing to save. */
  close(): void {
    const title = this.title.trim();
    if (!title) {
      this.ref.close();
      return;
    }

    const tags: StickyTag[] = [];
    const scope = this.scope.trim();
    if (scope && scope !== 'global') tags.push({ key: 'scope', value: scope });
    for (const raw of this.topics.split(',')) {
      const value = raw.trim();
      if (value) tags.push({ key: 'topic', value });
    }

    const body = (this.editor?.getMarkdown() ?? this.body).trim();
    const due_at = this.dueLocal ? new Date(this.dueLocal).toISOString() : null;
    const notify = this.notifyEnabled && !!due_at;

    this.ref.close({
      action: 'save',
      data: {
        title,
        body: body || null,
        color: this.color(),
        due_at,
        notify_enabled: notify,
        notify_offset_n: notify ? this.notifyN : null,
        notify_offset_unit: notify ? this.notifyUnit : null,
        pinned: this.pinned,
        tags,
      },
    });
  }
}
