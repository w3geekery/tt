import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownViewComponent } from './markdown-view.component';

@Component({
  selector: 'app-changelog-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MarkdownViewComponent,
  ],
  template: `
    <div class="changelog-dialog">
      <div class="changelog-header">
        <h2>Changelog</h2>
        <button mat-icon-button (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="changelog-body">
        @if (content()) {
          <app-markdown-view [content]="content()" />
        } @else {
          <p>Loading...</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .changelog-dialog {
      display: flex;
      flex-direction: column;
      max-height: 80vh;
    }

    .changelog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 8px 8px 24px;
      flex-shrink: 0;
      overflow: hidden;

      h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }

      button {
        flex-shrink: 0;
      }
    }

    .changelog-body {
      overflow-y: auto;
      padding: 8px 24px 24px;
      flex: 1;
      min-height: 0;
    }
  `],
})
export class ChangelogDialogComponent implements OnInit {
  private http = inject(HttpClient);
  private dialogRef = inject(MatDialogRef<ChangelogDialogComponent>);

  content = signal('');

  ngOnInit() {
    this.http.get('/CHANGELOG.md', { responseType: 'text' }).subscribe({
      next: (md) => {
        // Strip the "# Changelog" heading and preamble
        const cleaned = md.replace(/^# Changelog\s*\n+(?:All notable.*\n+)?/, '');
        this.content.set(cleaned);
      },
      error: () => this.content.set('Failed to load changelog.'),
    });
  }

  close() {
    this.dialogRef.close();
  }
}
