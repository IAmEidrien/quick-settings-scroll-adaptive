# Development

- Develop on `testing`; `main` is the release branch. Do not promote without an explicit request.
- Preserve upstream copyright and SPDX headers. The extension is GPL-2.0-or-later; independently written helpers and tests have MIT notices.
- Keep the Shell grid, overlay, submenu actors and submenu boxes by identity. Other extensions retain references to them. Do not replace global Shell methods for local scrolling fixes.
- Own and reverse every signal, compositor callback, style declaration and reparenting operation. Never destroy a Shell-owned actor when disabling this extension.
- Use actual monitor work areas and ThemeContext scaling, not assumed screen dimensions.
- Run `make test` and `make pack`. For layout, input or lifecycle changes, also run the isolated native probe described in docs/VALIDATION.md.
- Do not bump the version again for subsequent commits in the same pending testing update.
