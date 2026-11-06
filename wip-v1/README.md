# v1 milestone snapshot

Source commit: 4d84902 (v1).

- src/ contains the milestone source adapted to use system fonts.
- dist/ contains the production build and a standalone index.html. Serve this folder with any static web server; no build is needed.
- The root index.html, build/, package.json, and package-lock.json are based on the milestone. The build also regenerates dist/index.html.

This public snapshot excludes the original font files and uses system sans-serif and monospace fonts. Run npm ci and npm run build in this folder to rebuild it. The main project build does not update it.
