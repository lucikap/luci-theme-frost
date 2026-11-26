/*
 * Frost theme: smooth login -> admin transition.
 *  - login: hold a spinner until the wallpaper/fonts are ready, then fade the card in
 *  - login: remember the wallpaper in sessionStorage
 *  - admin: reuse that wallpaper (no random re-pick / visible reload) and slide
 *    the sidebar in on desktop
 */
(function () {
	'use strict';

	var root = document.documentElement;
	var isLogin = !!document.querySelector('.login-page');
	var img = document.querySelector('.main-bg img');
	var video = document.querySelector('.video video');

	function mark(cls) { root.classList.add(cls); }

	function whenBgReady(fn) {
		if (img) {
			if (img.complete && img.naturalWidth) { fn(); return; }
			img.addEventListener('load', fn, { once: true });
			img.addEventListener('error', fn, { once: true });
			return;
		}
		if (video) video.addEventListener('loadeddata', fn, { once: true });
		fn();
	}

	if (isLogin) {
		var finished = false;
		var finish = function () {
			if (finished) return;
			finished = true;
			mark('frost-ready');
			try {
				var src = (img && (img.currentSrc || img.src)) || (video && video.currentSrc);
				if (src) sessionStorage.setItem('frost-bg', src);
			}
			catch (e) { }
		};
		setTimeout(finish, 2800);
		var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
		Promise.resolve(fonts).then(function () {
			whenBgReady(finish);
		}).catch(finish);
		return;
	}

	/* admin: reuse the wallpaper seen on the login page (the server renders
	 * the image URL into data-src so nothing is fetched before this runs) */
	var stored = null;
	try { stored = sessionStorage.getItem('frost-bg'); } catch (e) { }

	if (img) {
		var fallback = img.getAttribute('data-src') || '';
		var desired = fallback;
		if (stored && !/\.(mp4|webm)(\?|$)/i.test(stored))
			desired = stored;
		if (!img.getAttribute('src') && desired)
			img.src = desired;
	}

	var menu = document.getElementById('mainmenu');
	var started = false;
	var startMenu = function () {
		if (started) return;
		started = true;
		mark('frost-entered');
	};
	var visible = function (el) {
		return el && getComputedStyle(el).display !== 'none' && el.offsetWidth > 0;
	};

	if (visible(menu)) {
		requestAnimationFrame(startMenu);
	}
	else if (menu) {
		var mo = new MutationObserver(function () {
			if (visible(menu)) {
				mo.disconnect();
				startMenu();
			}
		});
		mo.observe(menu, { attributes: true, attributeFilter: [ 'style', 'class' ] });
		setTimeout(function () { mo.disconnect(); startMenu(); }, 1500);
	}
	else {
		startMenu();
	}
})();
