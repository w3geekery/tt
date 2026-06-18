import { Component, OnInit, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import type { Subscription } from 'rxjs';
import { Sticky, StickyTag } from '../../models';
import { StickiesService } from '../../services/stickies.service';
import { SseService } from '../../services/sse.service';
import { StickyDialogComponent, StickyDialogData, StickyDialogResult } from './sticky-dialog';
import { MarkdownViewComponent } from '../../components/markdown-view.component';
import { DEFAULT_STICKY_COLOR, contrastFg, contrastDim } from './sticky-contrast';

@Component({
  selector: 'app-stickies',
  imports: [
    FormsModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MarkdownViewComponent,
  ],
  templateUrl: './stickies.html',
  styleUrl: './stickies.scss',
})
export class StickiesComponent implements OnInit, OnDestroy {
  private svc = inject(StickiesService);
  private sse = inject(SseService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private platformId = inject(PLATFORM_ID);
  private route = inject(ActivatedRoute);
  private sub?: Subscription;

  stickies = signal<Sticky[]>([]);
  loading = signal(false);
  editingTitleId = signal<string | null>(null);
  titleDraft = '';
  /** True when this view is the popped-out window (?pop) — hides the pop-out button. */
  readonly popped = this.route.snapshot.queryParamMap.has('pop');

  ngOnInit(): void {
    this.load();
    if (isPlatformBrowser(this.platformId)) {
      this.sse.connect();
      this.sub = this.sse.timerEvents$.subscribe((e) => {
        if (typeof e.type === 'string' && e.type.startsWith('sticky')) this.load();
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  load(): void {
    this.loading.set(true);
    this.svc.list({ status: 'open', include_children: true }).subscribe({
      next: (list) => { this.stickies.set(list); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast('Failed to load stickies'); },
    });
  }

  // ── inline title edit (stays on the card; everything else lives in the modal) ──

  startEditTitle(s: Sticky, ev: Event): void {
    ev.stopPropagation();
    this.titleDraft = s.title;
    this.editingTitleId.set(s.id);
    // Focus + select once the input has rendered.
    setTimeout(() => {
      const el = document.querySelector('input.title-input') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  /** Commit on blur/Enter — saves only when the title actually changed. */
  commitTitle(s: Sticky): void {
    if (this.editingTitleId() !== s.id) return;
    const next = this.titleDraft.trim();
    this.editingTitleId.set(null);
    if (next && next !== s.title) {
      this.svc.update(s.id, { title: next }).subscribe(() => this.load());
    }
  }

  // ── contrast (the sticky's color is its whole background) ──────────────────────

  cardBg(s: Sticky): string {
    return s.color || DEFAULT_STICKY_COLOR;
  }

  cardFg(s: Sticky): string {
    return contrastFg(this.cardBg(s));
  }

  cardDim(s: Sticky): string {
    return contrastDim(this.cardBg(s));
  }

  // ── Keep-style modal (click a card to open the roomy edit surface) ─────────────

  openCreate(): void {
    this.openModal({});
  }

  openEdit(s: Sticky): void {
    this.openModal({ sticky: s });
  }

  private openModal(data: StickyDialogData): void {
    this.dialog
      .open<StickyDialogComponent, StickyDialogData, StickyDialogResult>(StickyDialogComponent, {
        data,
        width: '600px',
        maxWidth: '95vw',
        panelClass: 'sticky-dialog-panel',
        disableClose: true, // the modal owns every close path so it can auto-save
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        const id = data.sticky?.id;
        if (result.action === 'save') {
          const req = id ? this.svc.update(id, result.data) : this.svc.create(result.data);
          req.subscribe({ next: () => this.load(), error: () => this.toast('Failed to save sticky') });
        } else if (result.action === 'archive' && id) {
          this.svc.archive(id).subscribe(() => { this.load(); this.toast(`Archived "${data.sticky!.title}"`); });
        } else if (result.action === 'delete' && id) {
          this.svc.remove(id).subscribe(() => { this.load(); this.toast(`Deleted "${data.sticky!.title}"`); });
        }
      });
  }

  toggleCheck(s: Sticky, ev?: Event): void {
    ev?.stopPropagation();
    (s.checked ? this.svc.uncheck(s.id) : this.svc.check(s.id)).subscribe(() => this.load());
  }

  togglePin(s: Sticky, ev: Event): void {
    ev.stopPropagation();
    (s.pinned ? this.svc.unpin(s.id) : this.svc.pin(s.id)).subscribe(() => this.load());
  }

  grab(): void {
    this.svc.grab().subscribe({
      next: (s) => this.toast(`Grab bag: ${s.title}`),
      error: () => this.toast('Grab bag is empty'),
    });
  }

  /** Open the board in a bare floating window. Shares the same API + SSE, so both stay live-synced. */
  popOut(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // ~1080px fits 4 columns: 4×240 min + 3×12 gaps + shell padding + scrollbar.
    window.open('/stickies?pop', 'tt-stickies', 'popup,width=1080,height=820');
  }

  topicTags(s: Sticky): StickyTag[] {
    return s.tags.filter((t) => t.key !== 'scope');
  }

  scopeTags(s: Sticky): StickyTag[] {
    return s.tags.filter((t) => t.key === 'scope');
  }

  /** Display in Pacific, matching the rest of tt. */
  formatDue(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  isOverdue(iso: string | null): boolean {
    return !!iso && new Date(iso).getTime() <= Date.now();
  }

  private toast(msg: string): void {
    this.snack.open(msg, 'OK', { duration: 3000 });
  }
}
