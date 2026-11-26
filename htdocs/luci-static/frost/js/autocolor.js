/*
 * Frost theme: pick an accent color from the current background image.
 * Plain script (no LuCI loader) so it also runs on the login page.
 */
(function() {
	'use strict';

	function rgbToHsl(r, g, b)
	{
		r /= 255; g /= 255; b /= 255;

		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var h = 0, s = 0, l = (max + min) / 2;

		if (max !== min) {
			var d = max - min;
			s = (l > 0.5) ? d / (2 - max - min) : d / (max + min);
			if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
			else if (max === g) h = (b - r) / d + 2;
			else h = (r - g) / d + 4;
			h /= 6;
		}

		return [ h, s, l ];
	}

	function hslToHex(h, s, l)
	{
		function hue(n) {
			var k = (n + h * 12) % 12;
			var a = s * Math.min(l, 1 - l);
			return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		}
		function to(v) {
			return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
		}
		return '#' + to(hue(0)) + to(hue(8)) + to(hue(4));
	}

	function sample(img)
	{
		var size = 32, canvas = document.createElement('canvas');
		canvas.width = size; canvas.height = size;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(img, 0, 0, size, size);

		var data;
		try { data = ctx.getImageData(0, 0, size, size).data; }
		catch (e) { return null; }  /* cross origin wallpaper */

		var r = 0, g = 0, b = 0, weight = 0;
		for (var i = 0; i < data.length; i += 4) {
			var R = data[i], G = data[i + 1], B = data[i + 2];
			var lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
			if (lum < 0.10 || lum > 0.90) continue;
			var max = Math.max(R, G, B), min = Math.min(R, G, B);
			var sat = (max - min) / (max || 1);
			var w = 0.35 + sat * 2.2;
			r += R * w; g += G * w; b += B * w; weight += w;
		}
		if (!weight) return null;

		var hsl = rgbToHsl(r / weight, g / weight, b / weight);
		var h = hsl[0], s = Math.max(hsl[1], 0.52), l = Math.max(0.38, Math.min(hsl[2], 0.5));

		return {
			accent: hslToHex(h, s, l),
			dark: hslToHex(h, Math.min(1, s * 0.95), Math.max(0.28, l - 0.12))
		};
	}

	var CACHE_KEY = 'frost-accent:';
	var CACHE_TTL = 7 * 24 * 3600 * 1000;

	function readCache(key)
	{
		try {
			var raw = window.localStorage.getItem(CACHE_KEY + key);
			if (!raw) return null;
			var entry = JSON.parse(raw);
			if (!entry || (Date.now() - entry.t) > CACHE_TTL) return null;
			return entry;
		}
		catch (e) { return null; }
	}

	function writeCache(key, picked)
	{
		try {
			window.localStorage.setItem(CACHE_KEY + key, JSON.stringify({
				t: Date.now(), accent: picked.accent, dark: picked.dark
			}));
		}
		catch (e) { /* private mode / quota */ }
	}

	function apply()
	{
		var root = document.documentElement;
		if (root.dataset.frostAutoColor !== '1') return;

		var img = document.querySelector('.main-bg img, #main-bg img');
		if (!img) return;

		function run() {
			/* sampling a 112 KiB wallpaper on every page view costs CPU; the
			 * picked accent is stable per image, so cache it for a week */
			var key = (img.currentSrc || img.src) + '|' + (img.naturalWidth || 0);
			var cached = readCache(key);

			if (cached) {
				root.style.setProperty('--primary', cached.accent);
				root.style.setProperty('--light-primary', cached.accent);
				root.style.setProperty('--dark-primary', cached.dark);
				return;
			}

			var picked = sample(img);
			if (!picked) return;

			root.style.setProperty('--primary', picked.accent);
			root.style.setProperty('--light-primary', picked.accent);
			root.style.setProperty('--dark-primary', picked.dark);
			writeCache(key, picked);
		}

		if (img.complete && img.naturalWidth) run();
		else img.addEventListener('load', run, { once: true });
	}

	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', apply);
	else
		apply();
})();
