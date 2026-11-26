'use strict';
'require baseclass';
'require rpc';
'require poll';

/*
 * Frost theme UI helpers
 *
 *  - fixed top bar: device/uptime/load/WAN/WWAN chips refreshed every 15 s
 *  - warning banners are moved from the page into the top bar as chips with a
 *    popover, so they never push the configuration content around
 *  - asynchronous navigation: clicking a menu entry only swaps the #view
 *    container instead of reloading the whole page (with a full reload as
 *    fallback when anything goes wrong)
 */

const callInfo = rpc.declare({ object: 'system', method: 'info', expect: { } });
const callBoard = rpc.declare({ object: 'system', method: 'board', expect: { } });
const callIfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { } });
const callDevStatus = rpc.declare({ object: 'network.device', method: 'status', params: ['name'], expect: { } });

/* views instantiated so far; LuCI caches view instances in L.require(), so a
 * revisit must re-run the cached instance instead of loading a new one */
const frostViews = new Set();
let frostNavigating = false;
let frostWatchdog = null;

/* prefetched page HTML, keeps SPA navigation close to instant on hover */
const frostPageCache = new Map();
const FROST_PREFETCH_TTL = 15000;

function fetchPage(url)
{
	let cached = frostPageCache.get(url);

	if (cached)
		return cached;

	const promise = fetch(url, {
		credentials: 'same-origin',
		headers: { 'Accept': 'text/html' },
		cache: 'no-store'
	}).then(function(res) {
		if (!res.ok)
			throw new Error('HTTP ' + res.status);

		return res.text();
	});

	frostPageCache.set(url, promise);
	promise.then(function() {
		window.setTimeout(function() {
			if (frostPageCache.get(url) === promise)
				frostPageCache.delete(url);
		}, FROST_PREFETCH_TTL);
	}, function() {
		frostPageCache.delete(url);
	});

	return promise;
}

/* GET requests must not trigger side effects: logout destroys the session and
 * reboot/flash/uci actions must never be fetched speculatively. */
function isSafePrefetch(url)
{
	if (url.origin !== location.origin || url.pathname.indexOf('/cgi-bin/luci/') !== 0)
		return false;

	if (/\/logout(?:\?|$)/.test(url.pathname))
		return false;

	if (/\/(flashops|uci)(?:\/|\?|$)/.test(url.pathname))
		return false;

	return true;
}

function prefetchLink(a)
{
	if (!a || a.dataset.frostPrefetched)
		return;

	try {
		const url = new URL(a.getAttribute('href'), location.href);

		if (!isSafePrefetch(url) || url.pathname === location.pathname)
			return;

		a.dataset.frostPrefetched = '1';
		fetchPage(url.href).catch(function() { });
	}
	catch (e) { }
}

/* only reload when the view never rendered: LuCI's own loading placeholder is
 * a direct .spinning child of #view, page widgets may keep their own spinners
 * nested deeper after a successful render */
function armWatchdog(target)
{
	if (frostWatchdog)
		window.clearTimeout(frostWatchdog);

	frostWatchdog = window.setTimeout(function() {
		frostWatchdog = null;

		const v = document.getElementById('view');
		const first = v ? v.firstElementChild : null;

		if (first && first.classList && first.classList.contains('spinning'))
			location.href = target.href;
	}, 8000);
}

function disarmWatchdog()
{
	if (frostWatchdog) {
		window.clearTimeout(frostWatchdog);
		frostWatchdog = null;
	}
}

function decorateOverview()
{
	const page = document.body.dataset.page;

	if (page !== 'admin-status' && page !== 'admin-status-overview')
		return;

	L.require('frost-overview').then(function(inst) {
		if (inst && typeof inst.__init__ === 'function')
			inst.__init__();
	}).catch(function() { });
}

/* thin progress bar while a page is fetched */
function showProgress()
{
	let bar = document.getElementById('frost-progress');

	if (!bar) {
		bar = document.createElement('div');
		bar.id = 'frost-progress';
		document.body.appendChild(bar);
	}

	bar.classList.add('active');
}

function hideProgress()
{
	const bar = document.getElementById('frost-progress');

	if (bar)
		bar.classList.remove('active');
}

function fmtUptime(sec)
{
	sec = +sec || 0;

	const d = Math.floor(sec / 86400);
	const h = Math.floor(sec % 86400 / 3600);
	const m = Math.floor(sec % 3600 / 60);

	if (d > 0)
		return '%dd %dh %dm'.format(d, h, m);
	if (h > 0)
		return '%dh %dm'.format(h, m);

	return '%dm'.format(m);
}

function setChip(id, text, state)
{
	const el = document.getElementById(id);

	if (!el)
		return;

	const dot = el.querySelector('.frost-dot');

	if (dot)
		dot.setAttribute('data-state', state || '');

	el.querySelector('.frost-text').textContent = text;
	el.classList.remove('up', 'down', 'warn');

	if (state)
		el.classList.add(state);
}

function fmtRate(bps)
{
	if (!(bps >= 0) || !isFinite(bps))
		return '0';

	if (bps >= 1048576)
		return (bps / 1048576).toFixed(1) + 'M/s';
	if (bps >= 1024)
		return Math.round(bps / 1024) + 'K/s';

	return Math.round(bps) + 'B/s';
}

/* per-interface traffic samples: iface -> { dev, rx, tx, t } */
const frostTrafficSamples = new Map();

function fmtRate(bps)
{
	if (!(bps >= 0) || !isFinite(bps))
		return '0';

	if (bps >= 1048576)
		return (bps / 1048576).toFixed(1) + 'M/s';
	if (bps >= 1024)
		return Math.round(bps / 1024) + 'K/s';

	return Math.round(bps) + 'B/s';
}

function renderTrafficChips(items)
{
	const wrap = document.getElementById('frost-traffic');

	if (!wrap)
		return;

	wrap.textContent = '';

	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const chip = document.createElement('span');
		chip.className = 'frost-chip up';
		chip.setAttribute('data-iface', it.iface);

		const dot = document.createElement('i');
		dot.className = 'frost-dot';
		chip.appendChild(dot);

		const txt = document.createElement('span');
		txt.className = 'frost-text';
		txt.textContent = it.label;
		chip.appendChild(txt);

		chip.title = it.iface + ' ' + (it.dev || '') + (it.dev ? ' ' : '') + _('Realtime traffic');
		wrap.appendChild(chip);
	}
}

function updateTraffic()
{
	return L.resolveDefault(callIfaces(), { }).then(function(dump) {
		const list = (dump.interface || []).filter(function(i) {
			return i.up && i.interface !== 'loopback' && (i.l3_device || i.device);
		});

		if (!list.length) {
			renderTrafficChips([]);
			return;
		}

		/* keep the LAN first, the rest alphabetically */
		list.sort(function(a, b) {
			if (a.interface === 'lan') return -1;
			if (b.interface === 'lan') return 1;
			return a.interface < b.interface ? -1 : 1;
		});

		const now = Date.now();
		const shown = [];

		return Promise.all(list.map(function(iface, idx) {
			const dev = iface.l3_device || iface.device;

			return L.resolveDefault(callDevStatus(dev), { }).then(function(st) {
				const stats = st.statistics || {};
				const prev = frostTrafficSamples.get(iface.interface);
				let rx = 0, tx = 0;

				if (prev && prev.dev === dev && (now - prev.t) > 500) {
					const dt = (now - prev.t) / 1000;

					rx = Math.max(0, (stats.rx_bytes - prev.rx) / dt);
					tx = Math.max(0, (stats.tx_bytes - prev.tx) / dt);
				}

				frostTrafficSamples.set(iface.interface, {
					dev: dev,
					rx: stats.rx_bytes || 0,
					tx: stats.tx_bytes || 0,
					t: now
				});

				if (!prev || prev.dev !== dev) {
					/* first sample: give the rate one poll to settle */
					shown[idx] = { iface: iface.interface, dev: dev, label: iface.interface.toUpperCase() + ' \u2193- \u2191-' };
				}
				else {
					shown[idx] = {
						iface: iface.interface,
						dev: dev,
						label: iface.interface.toUpperCase() + ' \u2193' + fmtRate(rx) + ' \u2191' + fmtRate(tx)
					};
				}
			});
		})).then(function() {
			/* drop samples for interfaces that disappeared */
			for (const key of Array.from(frostTrafficSamples.keys()))
				if (!list.some(function(i) { return i.interface === key; }))
					frostTrafficSamples.delete(key);

			renderTrafficChips(shown.filter(Boolean));
		});
	}).catch(function() { });
}

function updateStatusBar()
{
	if (!document.querySelector('.frost-chips'))
		return Promise.resolve();

	return Promise.all([
		L.resolveDefault(callInfo(), {}),
		L.resolveDefault(callBoard(), {})
	]).then(function(res) {
		const info = res[0] || {}, board = res[1] || {};

		const model = document.querySelector('#frost-chip-model .frost-text');
		if (model && board.model)
			model.textContent = board.model;

		setChip('frost-chip-uptime', _('Uptime') + ' ' + fmtUptime(info.uptime), null);

		/* ubus reports load averages scaled by 65536 */
		const load = Array.isArray(info.load) ? info.load : [];
		setChip('frost-chip-load', _('Load') + ' ' + (load[0] != null ? (load[0] / 65536).toFixed(2) : '--'), null);
	}).catch(function() { });
}

/* ------------------------------------------------------------------ */
/* warnings inside the top bar                                        */
/* ------------------------------------------------------------------ */

function syncWarnings()
{
	const wrap = document.getElementById('frost-warnings');

	if (!wrap)
		return;

	const alerts = document.querySelectorAll('#maincontent > .container > .alert-message');

	for (let i = 0; i < alerts.length; i++) {
		const el = alerts[i];

		if (el.dataset.frostBar)
			continue;

		el.dataset.frostBar = '1';
		el.classList.add('frost-in-bar');

		const title = (el.querySelector('h4') || el).textContent.trim().split('\n')[0].slice(0, 48);

		const chip = document.createElement('button');
		chip.type = 'button';
		chip.className = 'frost-chip frost-warn';
		chip.innerHTML = '<i class="frost-dot"></i><span class="frost-text"></span>';
		chip.querySelector('.frost-text').textContent = title;

		const pop = document.createElement('div');
		pop.className = 'frost-popover';
		pop.hidden = true;
		pop.appendChild(el);

		wrap.appendChild(chip);
		wrap.appendChild(pop);

		chip.addEventListener('click', function(ev) {
			ev.stopPropagation();
			pop.hidden = !pop.hidden;
		});

		pop.addEventListener('click', function(ev) {
			ev.stopPropagation();
		});
	}
}

/* ------------------------------------------------------------------ */
/* asynchronous navigation (only the #view container is replaced)      */
/* ------------------------------------------------------------------ */

function runScripts(root, skip)
{
	const scripts = Array.prototype.slice.call(root.querySelectorAll('script'));

	for (let i = 0; i < scripts.length; i++) {
		const old = scripts[i];

		if (skip && skip.test(old.textContent)) {
			old.parentNode.removeChild(old);
			continue;
		}

		/* the container also holds the LuCI bootstrap; replaying it would
		 * replace the L instance and break the whole page */
		if (/new\s+LuCI\s*\(/.test(old.textContent)) {
			old.parentNode.removeChild(old);
			continue;
		}

		const s = document.createElement('script');

		for (let a = 0; a < old.attributes.length; a++)
			s.setAttribute(old.attributes[a].name, old.attributes[a].value);

		s.textContent = old.textContent;
		old.parentNode.replaceChild(s, old);
	}
}

function markActive(pathname)
{
	const links = document.querySelectorAll('#mainmenu a[href]');
	let best = null, bestScore = -1;

	for (let i = 0; i < links.length; i++) {
		let p = null;

		try { p = new URL(links[i].getAttribute('href'), location.href).pathname; }
		catch (e) { continue; }

		/* exact match wins over prefix matches, longer prefixes win over shorter */
		const score = (p === pathname) ? 100000 + p.length
		            : (p !== '/' && pathname.indexOf(p) === 0) ? p.length : -1;

		if (score > bestScore) {
			bestScore = score;
			best = links[i];
		}
	}

	/* reset every item first, otherwise clicks accumulate the bottom bar */
	const items = document.querySelectorAll('#mainmenu a, #mainmenu li, #mainmenu ul');

	for (let i = 0; i < items.length; i++)
		items[i].classList.remove('active');

	if (!best)
		return;

	best.classList.add('active');

	/* keep the parent category and its submenu expanded */
	const submenu = best.closest('ul');
	if (submenu) {
		submenu.classList.add('active');

		const cat = submenu.previousElementSibling;
		if (cat && cat.tagName === 'A')
			cat.classList.add('active');
	}

	let li = best.closest('li');
	while (li) {
		li.classList.add('active');
		li = li.parentNode ? li.parentNode.closest('li') : null;
	}
}

function currentViewPath()
{
	const cont = document.querySelector('#maincontent > .container');

	return cont ? findViewPath(cont.innerHTML) : null;
}

function findViewPath(html)
{
	const m = html.match(/instantiateView\(\s*['"]([^'"]+)['"]\s*\)/);

	return m ? m[1] : null;
}

function readLuciLocation(html)
{
	const m = html.match(/var\s+luciLocation\s*=\s*([^;]+);/);

	if (!m)
		return null;

	try { return JSON.parse(m[1]); }
	catch (e) { return null; }
}

function asyncNavigate(url, push)
{
	const target = new URL(url, location.href);
	const cont = document.querySelector('#maincontent > .container');

	if (!cont || target.origin !== location.origin ||
	    target.pathname.indexOf('/cgi-bin/luci/') !== 0) {
		location.href = target.href;
		return;
	}

	/* clicking the current entry again must not restart the view */
	if (target.pathname === location.pathname && target.search === location.search)
		return;

	if (frostNavigating)
		return;

	frostNavigating = true;
	disarmWatchdog();
	showProgress();

	const current = document.getElementById('view');
	if (current)
		current.classList.add('frost-loading');

	fetchPage(target.href).then(function(html) {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const nc = doc.querySelector('#maincontent > .container');
		const nv = nc ? nc.querySelector('#view') : null;

		if (!nc || !nv)
			throw new Error('no main container in response');

		/* LuCI renders page chrome (the h2 title, #tabmenu, template
		 * .includes blocks and their scripts) inside the container but outside
		 * #view. Swap the whole container so nothing from the previous page
		 * survives, and use a fresh #view node so a late render of the old
		 * view cannot paint over the new page. */
		const next = document.createElement('div');
		next.className = cont.className;
		next.innerHTML = nc.innerHTML;
		cont.parentNode.replaceChild(next, cont);

		if (doc.title)
			document.title = doc.title;

		if (doc.body && doc.body.dataset.page)
			document.body.dataset.page = doc.body.dataset.page;

		/* the overview decorator observes a #view node it captured on load;
		 * re-bind it to the node we just installed */
		decorateOverview();

		const loc = readLuciLocation(html);
		if (loc)
			window.luciLocation = loc;

		const vpath = findViewPath(html);
		let rendered = Promise.resolve();

		if (!vpath) {
			/* server rendered view: copy its scripts, nothing to instantiate */
			runScripts(next, /instantiateView\s*\(/);
		}
		else if (frostViews.has(vpath)) {
			/* LuCI caches the view instance; re-run it against the fresh #view
			 * instead of letting instantiateView() return the stale instance. */
			runScripts(next, /instantiateView\s*\(/);

			rendered = L.require('view.' + vpath.replace(/\//g, '.')).then(function(inst) {
				if (!inst || typeof inst.__init__ !== 'function')
					throw new Error('view instance without __init__');

				const ret = inst.__init__();
				return (ret && typeof ret.then === 'function') ? ret : Promise.resolve();
			});
		}
		else {
			if (vpath)
				frostViews.add(vpath);

			/* template actions (overview, realtime, ...) ship helper scripts
			 * outside #view; run those but instantiate the view explicitly */
			runScripts(next, /instantiateView\s*\(/);

			rendered = L.require('ui').then(function(ui) {
				if (typeof ui.instantiateView !== 'function')
					throw new Error('ui.instantiateView missing');

				if (!vpath)
					throw new Error('no view path');

				const ret = ui.instantiateView(vpath);
				return (ret && typeof ret.then === 'function') ? ret : Promise.resolve();
			});
		}

		/* the warning chip lives in the toolbar; rebuild it from the new page */
		const wrap = document.getElementById('frost-warnings');
		if (wrap)
			wrap.textContent = '';

		markActive(target.pathname);
		syncWarnings();

		if (push)
			history.pushState({ frost: 1 }, '', target.href);

		/* last resort: if the view still shows only LuCI's loading placeholder
		 * after a grace period, fall back to a full load */
		if (vpath)
			armWatchdog(target);
		else
			disarmWatchdog();

		return rendered;
	}).catch(function(err) {
		console.warn('frost: async navigation failed, falling back to reload', err);
		location.href = target.href;
	}).then(function() {
		frostNavigating = false;

		const v = document.getElementById('view');
		if (v)
			v.classList.remove('frost-loading');

		hideProgress();
	});
}

function initNavigation()
{
	document.addEventListener('click', function(ev) {
		if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey ||
		    ev.shiftKey || ev.altKey)
			return;

		const a = ev.target.closest ? ev.target.closest('a[href]') : null;

		if (!a || a.target === '_blank' || a.hasAttribute('download'))
			return;

		if (!a.closest('#mainmenu') && !a.closest('#modemenu') && !a.closest('.breadcrumb'))
			return;

		const href = a.getAttribute('href');

		if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0)
			return;

		/* logout is a server side action: it destroys the session and redirects
		 * to the login page. Fetching it asynchronously would invalidate the
		 * session first and then leave the login form at the logout URL, so let
		 * the browser follow it natively. */
		if (/\/logout(?:\?|$)/.test(href))
			return;

		/* never intercept POST-only or destructive endpoints */
		if (/\/(flashops|uci)(?:\/|\?|$)/.test(href))
			return;

		ev.preventDefault();
		asyncNavigate(a.href, true);
	}, false);

	document.addEventListener('mouseover', function(ev) {
		const a = ev.target.closest ? ev.target.closest('#mainmenu a[href], #modemenu a[href], .breadcrumb a[href]') : null;

		if (a)
			prefetchLink(a);
	}, { passive: true });

	document.addEventListener('focusin', function(ev) {
		const a = ev.target.closest ? ev.target.closest('#mainmenu a[href], #modemenu a[href], .breadcrumb a[href]') : null;

		if (a)
			prefetchLink(a);
	});

	window.addEventListener('popstate', function() {
		if (location.pathname.indexOf('/cgi-bin/luci/') === 0)
			asyncNavigate(location.href, false);
	});
}

function start()
{
	if (document.querySelector('.frost-chips')) {
		updateStatusBar();
		poll.add(updateStatusBar, 15);

		updateTraffic();
		poll.add(updateTraffic, 3);
	}

	syncWarnings();
	initNavigation();

	const initial = currentViewPath();
	if (initial)
		frostViews.add(initial);
}

if (document.readyState === 'loading')
	document.addEventListener('DOMContentLoaded', start);
else
	start();

return baseclass.extend({ __name__: 'Frost.UI' });
