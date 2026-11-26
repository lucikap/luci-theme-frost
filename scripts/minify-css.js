#!/usr/bin/env node
/*
 * Regenerate the shipped stylesheet from styles/cascade.source.css.
 * The build's csstidy mangles modern CSS (calc()/var() nesting), so the theme
 * ships a csso-minified file and keeps the readable source outside htdocs.
 *
 *   npm install csso && node scripts/minify-css.js
 */
const fs = require('fs');
const path = require('path');
const csso = require('csso');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'styles/cascade.source.css');
const out = path.join(root, 'htdocs/luci-static/frost/css/cascade.css');

const result = csso.minify(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(out, result.css);
console.log(`${src} (${fs.statSync(src).size} B) -> ${out} (${result.css.length} B)`);
