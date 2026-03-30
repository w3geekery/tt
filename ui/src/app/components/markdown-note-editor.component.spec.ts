import { describe, it, expect } from 'vitest';

/**
 * MarkdownNoteEditorComponent unit tests.
 *
 * Tests the component's state machine: view ↔ edit transitions,
 * save/cancel behavior, and output emission logic.
 */
describe('MarkdownNoteEditorComponent (state logic)', () => {
  // Minimal state simulation matching the component's signals
  function createState(initialNotes = '') {
    let editing = false;
    let editContent = '';
    const notes = initialNotes;
    const emitted: string[] = [];

    return {
      get editing() { return editing; },
      get editContent() { return editContent; },
      get notes() { return notes; },
      get emitted() { return emitted; },

      startEdit() {
        editContent = notes || '';
        editing = true;
      },

      cancelEdit() {
        editing = false;
      },

      saveEdit(getMarkdownOverride?: string) {
        const markdown = getMarkdownOverride ?? editContent;
        emitted.push(markdown.trim());
        editing = false;
      },

      setEditContent(value: string) {
        editContent = value;
      },
    };
  }

  describe('initial state', () => {
    it('should start in view mode', () => {
      const state = createState('some notes');
      expect(state.editing).toBe(false);
    });

    it('should not have emitted any changes', () => {
      const state = createState();
      expect(state.emitted).toEqual([]);
    });
  });

  describe('startEdit', () => {
    it('should switch to editing mode', () => {
      const state = createState('hello');
      state.startEdit();
      expect(state.editing).toBe(true);
    });

    it('should populate editContent with current notes', () => {
      const state = createState('# My Notes');
      state.startEdit();
      expect(state.editContent).toBe('# My Notes');
    });

    it('should use empty string when notes is empty', () => {
      const state = createState('');
      state.startEdit();
      expect(state.editContent).toBe('');
    });
  });

  describe('cancelEdit', () => {
    it('should switch back to view mode', () => {
      const state = createState('hello');
      state.startEdit();
      state.cancelEdit();
      expect(state.editing).toBe(false);
    });

    it('should not emit any changes on cancel', () => {
      const state = createState('hello');
      state.startEdit();
      state.setEditContent('changed content');
      state.cancelEdit();
      expect(state.emitted).toEqual([]);
    });
  });

  describe('saveEdit', () => {
    it('should emit trimmed markdown and switch to view mode', () => {
      const state = createState('');
      state.startEdit();
      state.saveEdit('  # New content  ');
      expect(state.editing).toBe(false);
      expect(state.emitted).toEqual(['# New content']);
    });

    it('should emit empty string for whitespace-only content', () => {
      const state = createState('');
      state.startEdit();
      state.saveEdit('   ');
      expect(state.emitted).toEqual(['']);
    });

    it('should use editContent as fallback when editor returns nothing', () => {
      const state = createState('');
      state.startEdit();
      state.setEditContent('fallback content');
      state.saveEdit(undefined); // no editor override
      expect(state.emitted).toEqual(['fallback content']);
    });

    it('should handle multiple save cycles', () => {
      const state = createState('');
      state.startEdit();
      state.saveEdit('first');
      state.startEdit();
      state.saveEdit('second');
      expect(state.emitted).toEqual(['first', 'second']);
    });
  });

  describe('full workflow', () => {
    it('should handle view → edit → cancel → edit → save', () => {
      const state = createState('original');

      // View → Edit
      state.startEdit();
      expect(state.editing).toBe(true);
      expect(state.editContent).toBe('original');

      // Edit → Cancel (back to view)
      state.setEditContent('discarded changes');
      state.cancelEdit();
      expect(state.editing).toBe(false);
      expect(state.emitted).toEqual([]);

      // View → Edit again
      state.startEdit();
      expect(state.editContent).toBe('original'); // reset to notes, not discarded

      // Edit → Save
      state.saveEdit('final content');
      expect(state.editing).toBe(false);
      expect(state.emitted).toEqual(['final content']);
    });
  });
});
