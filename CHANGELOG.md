# Changelog

## v3.1.4-r20261179 (2026-11-26)

First public release of **Frost**, a glassmorphism fork of luci-theme-argon.

### Added
- Centered glass login card with a boot spinner; the page fades in once the
  wallpaper and web fonts are ready.
- The wallpaper chosen on the login page is reused by the admin UI
  (`sessionStorage`), so it no longer re-randomises or visibly reloads.
- Accent color sampled from the wallpaper, cached in `localStorage` for 7 days.
- One global transparency + blur scale covering the login card and every
  frosted surface in the admin UI.
- Sticky status bar with model, uptime, load, live traffic and warnings.
- Async menu navigation that only swaps the right-hand container.
- Desktop entrance animation (sidebar slide-in, content fade-up); disabled on
  mobile and with `prefers-reduced-motion`.
- Glass port tiles: at least 1/6 of the container width, content-driven height.
- zh_Hans translations for all theme settings.

### Changed
- Renamed from `openfi6c` to `frost`: package, theme id, media path, JS
  modules, ACL, menu, rpcd objects, UCI config (`/etc/config/frost`).
- Removed the manual primary/dark-primary color options and the login-style
  selector; the theme is always the centered card with wallpaper-derived color.
- Stylesheet shipped minified with csso (324 KB → 270 KB); readable source in
  `styles/cascade.source.css`, regenerate with `node scripts/minify-css.js`.

### Notes
- Keep `LUCI_MINIFY_CSS=0`: buildroot's csstidy corrupts modern CSS.
- Verified on ImmortalWrt SNAPSHOT (MediaTek MT7981, OpenFi 6C).
