# ZeroBias Task Description Template

> Used by `/zbt` when creating or updating ZeroBias Tasks from time tracker entries.

## Template

```
## Work Summary

**Company:** {{company}}
**Project:** {{project}}
**Task Type:** {{taskType}}
**Date:** {{date}}
**Duration:** {{duration}} hours

## Description

{{notes}}

## Time Entries

| Date | Duration | Notes |
|------|----------|-------|
{{#entries}}
| {{date}} | {{duration}}h | {{notes}} |
{{/entries}}

**Total Time:** {{totalDuration}} hours
```

## Usage Notes

- For single-session tasks: fill in one entry row
- For multi-session tasks: accumulate entries over time, update the task description
- `notes` field comes from the time tracker entry notes (may be null — use task type as fallback)
- Duration is in decimal hours (e.g., 1.75, not 1h45m)
- Date format: `Mon Feb 10, 2026` (human-readable, PT)
