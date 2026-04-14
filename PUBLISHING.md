# Publishing & Release Workflow

How `tt` versions are cut, tagged, and shipped.

## Tooling

| Tool | Role |
|------|------|
| `standard-version` (^9.5.0) | Auto-bumps `package.json` + `package-lock.json`, prepends a section to `CHANGELOG.md`, creates `chore(release): X.Y.Z` commit + `vX.Y.Z` tag |
| `commitlint` + `husky` | Enforces [Conventional Commits](https://www.conventionalcommits.org/) at commit time — `standard-version` reads those commit messages to decide bump type and build the changelog section |
| Git tag `vX.Y.Z` | Immutable release marker — used by `standard-version` to bound "what's new since the last release" on the next run |

## Files

| Path | Role |
|------|------|
| `CHANGELOG.md` (repo root) | **Source of truth.** `standard-version` writes here. Do NOT edit the auto-generated section headers (`### X.Y.Z (YYYY-MM-DD)`) — they're rebuilt on the next release. |
| `ui/public/CHANGELOG.md` | Symlink → `../../CHANGELOG.md`. Angular serves `/CHANGELOG.md` at runtime from this path; the in-app changelog dialog loads it. **Never edit this file directly** — edit the root and the symlink will reflect the change. |

### Pre-existing handwritten content

The CHANGELOG contains some handwritten dated sections (`## 2026-04-13`, `## 2026-04-14`) that predate `standard-version` being wired into the workflow. They sit below the auto-generated section and are kept for historical context. Future releases will just prepend on top.

## Commit message conventions

Commit type determines what happens at release time. Use these prefixes:

| Prefix | SemVer bump (pre-1.0) | SemVer bump (≥1.0) | Triggers release cut? |
|--------|-----------------------|---------------------|-----------------------|
| `feat:` | patch (0.0.x) | minor (0.x.0) | Yes |
| `fix:` | patch | patch | Yes |
| `perf:` | patch | patch | Yes |
| `refactor:` | — | — | No (ship with next feat/fix) |
| `test:` | — | — | No |
| `docs:` | — | — | No |
| `chore:` | — | — | No |
| `ci:` | — | — | No |
| `BREAKING CHANGE:` in body, or `feat!:` / `fix!:` with `!` | major (1.0.0 jump) | major (X+1.0.0) | Yes — with `--release-as major` |

**Pre-1.0 note:** while we're in `0.x.y`, `standard-version`'s default behavior is that `feat:` bumps patch, not minor. This matches SemVer's "0.x is unstable, anything goes" semantics. If you want an explicit minor bump on a meaningful feature, run `npm run release:minor` instead of plain `npm run release`.

## When Clark says "ship it"

Treat "ship it" / "ship this" as the full release dance, *conditional on the commit type*:

### Step 1 — Commit with the right prefix

Stage only the relevant files (by name, never `git add -A`). Use Conventional Commits format with a `Session: claude --resume <branch>` line in the body. Always include the Co-Author trailer:

```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### Step 2 — Push to `main`

```bash
git push origin main
```

### Step 3 — Decide if a release cut is warranted

Based on the commit(s) since the last tag:

| Commits include… | Action |
|------------------|--------|
| Only `chore:` / `docs:` / `test:` / `refactor:` / `ci:` | **Stop after Step 2.** No release cut. The work lands in the next feat/fix release's changelog. |
| At least one `feat:` or `fix:` / `perf:` | Continue to Step 4. |
| A `BREAKING CHANGE:` marker | Continue to Step 4 using `npm run release:major`. |
| Clark explicitly said "minor bump" or the feature is substantial | Use `npm run release:minor`. |

### Step 4 — Run the release

```bash
npm run release              # default — patch on 0.x, minor on ≥1.x
npm run release:minor        # force minor bump
npm run release:major        # force major bump
```

`standard-version` will:
1. Bump `package.json` + `package-lock.json`
2. Prepend a new `### X.Y.Z (YYYY-MM-DD)` section to `CHANGELOG.md` based on the conventional commits since the last tag
3. Create a `chore(release): X.Y.Z` commit staging those changes
4. Create a `vX.Y.Z` git tag

### Step 5 — Push the release commit + tag

```bash
git push --follow-tags origin main
```

`--follow-tags` pushes any annotated tags reachable from the pushed commits, so the new `vX.Y.Z` tag lands on origin along with the `chore(release)` commit.

## Worked example

Clark asks me to ship after a `feat:` commit that's already committed + pushed:

```bash
# Step 4: cut the release
npm run release
# → bumps 0.1.1 → 0.1.2 (patch, because we're pre-1.0)
# → writes "### 0.1.2 (2026-04-14)" to CHANGELOG.md
# → creates chore(release): 0.1.2 commit
# → creates v0.1.2 tag

# Step 5: publish
git push --follow-tags origin main
```

If the feat was substantial enough to warrant a minor bump:

```bash
npm run release:minor
# → 0.1.2 → 0.2.0
```

## When NOT to run release

- After a `chore:` commit like moving files, fixing typos, or updating config
- After a `docs:` or `test:` commit
- When Clark says "commit this" without "ship" / "release" / "version"
- When there are local uncommitted changes unrelated to the release (stage/commit/stash first)
- When the working tree is dirty after a failed build (fix the build first)

## Rolling back a bad release

```bash
# Reset to before the release commit (before standard-version ran)
git reset --hard HEAD~1                    # undoes chore(release) commit
git tag -d vX.Y.Z                          # removes local tag
git push origin :refs/tags/vX.Y.Z          # removes remote tag (if pushed)
```

Ask Clark before doing any of this — rolling back a published tag is a destructive op.

## CHANGELOG editing rules

- **Do not** hand-edit auto-generated `### X.Y.Z (YYYY-MM-DD)` sections. `standard-version` expects to own them; edits may be overwritten on the next release.
- **Do** hand-edit older handwritten sections (e.g., pre-`standard-version` dated entries) for typos, context, or clarity — those are frozen historical notes.
- **Do not** commit a manual edit to `CHANGELOG.md` as part of a `feat:` or `fix:` commit. Let `standard-version` own new entries. If there's context that wouldn't emerge from the commit messages, put it in the commit body itself — `standard-version` can include it via `BREAKING CHANGE:` or linked issues.
