import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as stickiesDb from '../../db/stickies.js';
import type { StickyStatus } from '../../db/stickies.js';
import { syncStickyReminder, cancelStickyReminder } from '../../reminders.js';
import { broadcast } from '../sse.js';

export const stickiesRouter = Router();

const emit = (event: 'sticky-created' | 'sticky-updated' | 'sticky-deleted', data: unknown): void => {
  broadcast(event, { type: event, data });
};

// GET /api/stickies?scope=zb-ui&status=open&include_children=true&limit=50
stickiesRouter.get('/', (req: Request, res: Response) => {
  const { scope, status, include_children, limit } = req.query;
  const list = stickiesDb.list(getDb(), {
    repo_scope: typeof scope === 'string' ? scope : undefined,
    status: typeof status === 'string' ? (status as StickyStatus) : undefined,
    include_children: include_children === 'true',
    limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
  });
  res.json(list);
});

// GET /api/stickies/session?scope=zb-ui&limit=10 — compact SessionStart slice
stickiesRouter.get('/session', (req: Request, res: Response) => {
  const { scope, limit } = req.query;
  const slice = stickiesDb.getSessionSlice(getDb(), {
    repo_scope: typeof scope === 'string' ? scope : undefined,
    limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
  });
  res.json(slice);
});

// GET /api/stickies/grab?scope=zb-ui — pull a random grab-bag sticky
stickiesRouter.get('/grab', (req: Request, res: Response) => {
  const { scope } = req.query;
  const sticky = stickiesDb.grab(getDb(), typeof scope === 'string' ? scope : undefined);
  if (!sticky) { res.status(404).json({ error: 'Grab bag is empty' }); return; }
  res.json(sticky);
});

// GET /api/stickies/:id
stickiesRouter.get('/:id', (req: Request, res: Response) => {
  const sticky = stickiesDb.findById(getDb(), req.params.id as string);
  if (!sticky) { res.status(404).json({ error: 'Sticky not found' }); return; }
  res.json(sticky);
});

// POST /api/stickies — create. `scope` (string) is sugar for a scope:<repo> tag.
stickiesRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const { scope, tags, ...rest } = req.body ?? {};
  if (!rest.title) { res.status(400).json({ error: 'title is required' }); return; }
  const allTags = [...(Array.isArray(tags) ? tags : [])];
  if (typeof scope === 'string' && scope && scope !== 'global') allTags.push({ key: 'scope', value: scope });
  let sticky;
  try {
    sticky = stickiesDb.create(db, { ...rest, tags: allTags });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  syncStickyReminder(db, sticky);
  emit('sticky-created', sticky);
  res.status(201).json(sticky);
});

// PATCH /api/stickies/:id — update
stickiesRouter.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  let sticky;
  try {
    sticky = stickiesDb.update(db, req.params.id as string, req.body ?? {});
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!sticky) { res.status(404).json({ error: 'Sticky not found' }); return; }
  syncStickyReminder(db, sticky);
  emit('sticky-updated', sticky);
  res.json(sticky);
});

// State transitions — each re-syncs the reminder and broadcasts.
type Mutator = (db: ReturnType<typeof getDb>, id: string) => ReturnType<typeof stickiesDb.findById>;
const action = (fn: Mutator) => (req: Request, res: Response): void => {
  const db = getDb();
  const sticky = fn(db, req.params.id as string);
  if (!sticky) { res.status(404).json({ error: 'Sticky not found' }); return; }
  syncStickyReminder(db, sticky);
  emit('sticky-updated', sticky);
  res.json(sticky);
};

stickiesRouter.post('/:id/check', action(stickiesDb.check));
stickiesRouter.post('/:id/uncheck', action(stickiesDb.uncheck));
stickiesRouter.post('/:id/pin', action(stickiesDb.pin));
stickiesRouter.post('/:id/unpin', action(stickiesDb.unpin));
stickiesRouter.post('/:id/archive', action(stickiesDb.archive));
stickiesRouter.post('/:id/unarchive', action(stickiesDb.unarchive));
stickiesRouter.post('/:id/detach', action(stickiesDb.detach));

// POST /api/stickies/:id/reorder { position }
stickiesRouter.post('/:id/reorder', (req: Request, res: Response) => {
  const { position } = req.body ?? {};
  if (typeof position !== 'number') { res.status(400).json({ error: 'position (number) is required' }); return; }
  const sticky = stickiesDb.reorder(getDb(), req.params.id as string, position);
  if (!sticky) { res.status(404).json({ error: 'Sticky not found' }); return; }
  emit('sticky-updated', sticky);
  res.json(sticky);
});

// PUT /api/stickies/:id/tags { tags } — replace the entire tag set
stickiesRouter.put('/:id/tags', (req: Request, res: Response) => {
  const { tags } = req.body ?? {};
  if (!Array.isArray(tags)) { res.status(400).json({ error: 'tags (array) is required' }); return; }
  const sticky = stickiesDb.setTags(getDb(), req.params.id as string, tags);
  if (!sticky) { res.status(404).json({ error: 'Sticky not found' }); return; }
  emit('sticky-updated', sticky);
  res.json(sticky);
});

// POST /api/stickies/checklist { parent_id, child_ids } — gather into a checklist
stickiesRouter.post('/checklist', (req: Request, res: Response) => {
  const { parent_id, child_ids } = req.body ?? {};
  if (!parent_id || !Array.isArray(child_ids)) {
    res.status(400).json({ error: 'parent_id and child_ids[] are required' });
    return;
  }
  const parent = stickiesDb.makeChecklist(getDb(), parent_id, child_ids);
  if (!parent) { res.status(404).json({ error: 'Parent not found' }); return; }
  emit('sticky-updated', parent);
  res.json(parent);
});

// DELETE /api/stickies/:id — hard delete (children + tags cascade)
stickiesRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  cancelStickyReminder(db, id);
  if (!stickiesDb.remove(db, id)) { res.status(404).json({ error: 'Sticky not found' }); return; }
  emit('sticky-deleted', { id });
  res.status(204).end();
});
