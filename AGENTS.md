# Agents

## Available Agents

### planner
Create detailed implementation plans before writing code. Use `/plan` to invoke.

### code-reviewer
Review recently written or modified code for quality, patterns, and issues.

### Explore
Fast codebase exploration — find files, search code, answer architecture questions.

## Agent Guidelines

- Use `planner` for any feature spanning 3+ files
- Use `code-reviewer` after completing a feature or significant refactor
- Use `Explore` for codebase navigation and understanding
- Always use Sonnet agents for bulk/repetitive operations
- Prefer direct tool use (Glob, Grep, Read) for simple lookups
