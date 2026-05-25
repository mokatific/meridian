---
inclusion: always
---

# Changelog & README Update Rules

Every time you make changes to the codebase - whether a bugfix, a new feature, or a small improvement - follow these rules:

## CHANGELOG.md

**Always update** `CHANGELOG.md` after each code change that is committed.

New entry format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- Description of new features

### Changed

- Description of changes to existing features

### Fixed

- Description of bugfixes

### Technical

- Technical details relevant to developers
```

Versioning rules (Semantic Versioning):

- **PATCH** (X.Y.**Z**) - bugfixes, small fixes, internal changes without new features
- **MINOR** (X.**Y**.0) - new features that are backward compatible
- **MAJOR** (**X**.0.0) - breaking changes or major architecture overhauls

Changes that **must** go into the CHANGELOG:

- Adding new files (module, tool, utility)
- Changes to agent behavior (screening rules, management rules)
- Changes to config keys or defaults
- Adding Telegram commands
- Bugfixes that affect behavior
- API changes or external integrations

Changes that **do not** need to go into the CHANGELOG:

- Comment-only updates
- Renaming internal variables without behavior changes
- Updating `.gitignore`

## README.md

**Optional update** - only if the change is important for new or existing users to know.

Add to the README if:

- New user-facing features (new commands, visible behavior changes)
- Changes to setup or configuration
- Significant new architecture sections
- Changes to Telegram commands

No need to update the README for:

- Internal bugfixes
- Refactors without behavior changes
- Technical changes that do not affect usage

## Workflow

1. Make code changes
2. Update CHANGELOG.md with a new entry at the top (after the `# Changelog` header)
3. If needed, update README.md
4. Commit everything together
