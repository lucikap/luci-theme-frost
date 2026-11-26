'use strict';
'require form';
'require frost.branding as branding';
'require fs';
'require rpc';
'require uci';
'require ui';
'require view';

const callAvailSpace = rpc.declare({
	object: 'luci.frost',
	method: 'avail',
	raise: true,
	expect: { '': { avail: 0 } }
});

const callRemoveFrost = rpc.declare({
	object: 'luci.frost',
	method: 'remove',
	params: ['filename'],
	raise: true,
	expect: { '': {} }
});

const callRenameFrost = rpc.declare({
	object: 'luci.frost',
	method: 'rename',
	params: ['newname'],
	raise: true,
	expect: { '': {} }
});

const bg_path = '/www/luci-static/frost/background/';

const trans_set = [0, 0.1, 0.2, 0.3, 0.4,
	0.5, 0.6, 0.7, 0.8, 0.9, 1 ];

function expandHex(value) {
	if (/^#[0-9a-f]{3}$/i.test(value))
		return value.replace(/[0-9a-f]/gi, (digit) => { return digit + digit; }).toLowerCase();
	return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

const ColorValue = form.Value.extend({
	validate(section_id, value) {
		return expandHex(value) !== null ||
			_('Expecting: %s').format(_('valid HEX color value'));
	},

	renderWidget(section_id, option_index, cfgvalue) {
		// Keep the native Textfield and its binding as the saved form value.
		const node = this.super('renderWidget', [section_id, option_index, cfgvalue]);
		const input = node.querySelector('input');
		const picker = E('input', {
			'type': 'color',
			'id': this.cbid(section_id) + '-picker',
			'class': 'frost-color-swatch',
			'value': expandHex(input.value) || this.default,
			'disabled': input.disabled || null,
			'aria-label': this.title,
			'title': this.title
		});

		node.classList.add('frost-color-picker');
		input.setAttribute('spellcheck', 'false');
		input.setAttribute('autocapitalize', 'off');
		input.setAttribute('autocomplete', 'off');
		node.appendChild(picker);

		const updatePicker = () => {
			const color = expandHex(input.value);
			if (color !== null)
				picker.value = color;
		};
		const updateText = L.bind(() => {
			if (input.disabled || input.readOnly)
				return;
			input.value = picker.value;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			this.triggerValidation(section_id);
		}, this);
		input.addEventListener('input', updatePicker);
		input.addEventListener('change', updatePicker);
		picker.addEventListener('input', updateText);
		picker.addEventListener('change', updateText);
		return node;
	}
});

return view.extend({
	load() {
		return Promise.all([
			uci.load('frost'),
			callAvailSpace().catch((e) => {
				ui.addNotification(null, E('p', _('Failed to read available space: %s.').format(e.message)));
				return { avail: 0 };
			}),
			fs.list(bg_path).then((files) => {
				return files.filter((file) => {
					return file.type === 'file' && /\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(file.name);
				});
			}).catch((e) => {
				ui.addNotification(null, E('p', _('Failed to list background files: %s.').format(e.message)));
				return [];
			}),
			branding.load()
		]);
	},

	render(data) {
		let m, s, o;

		m = new form.Map('frost', _('Frost theme configuration'),
			_('Here you can set the blur and transparency of the login page of frost theme, and manage the background pictures and videos.'));

		s = m.section(form.TypedSection, 'global', _('Theme configuration'));
		s.addremove = false;
		s.anonymous = true;

		o = s.option(form.ListValue, 'online_wallpaper', _('Wallpaper source'));
		o.value('none', _('Built-in'));
		o.value('bing', _('Bing'));
		o.value('ghser', _('GHSer'));
		o.value('unsplash', _('Unsplash'));
		o.value('wallhaven', _('Wallhaven'));
		o.default = 'none';
		o.rmempty = false;
		o.forcewrite = true;
		o.cfgvalue = function(section_id) {
			return (uci.get('frost', section_id, 'online_wallpaper') || 'none').split('_')[0];
		};
		o.write = function(section_id, value) {
			const collection = this.section.formvalue(section_id, 'collection_id');
			if (collection && (value === 'unsplash' || value === 'wallhaven'))
				value += '_' + collection;
			uci.set('frost', section_id, 'online_wallpaper', value);
		};

		o = s.option(form.Value, 'collection_id', _('Collection ID'),
			_('Collection ID for Unsplash or Wallhaven.'));
		o.datatype = 'uinteger';
		o.depends('online_wallpaper', 'unsplash');
		o.depends('online_wallpaper', 'wallhaven');
		o.cfgvalue = function(section_id) {
			const value = uci.get('frost', section_id, 'online_wallpaper');
			if (!value || !value.includes('_'))
				return '';

			return value.split('_')[1];
		};
		o.write = function() {};

		o = s.option(form.Value, 'use_api_key', _('API key'),
			_('Specify API key for Unsplash or Wallhaven.'));
		o.password = true;
		o.depends('online_wallpaper', 'unsplash');
		o.depends('online_wallpaper', 'wallhaven');
		o.rmempty = true;

		o = s.option(form.Flag, 'use_exact_resolution', _('Use exact resolution'),
			_('Use exact resolution or at least 1080P for Wallhaven.'));
		o.default = o.enabled;
		o.depends('online_wallpaper', 'wallhaven');

		o = s.option(form.Flag, 'glass_admin', _('Frosted glass interface'),
			_('Keep the login background after login and render the sidebar, toolbar and cards as translucent frosted glass'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'glass_alpha', _('Global transparency'),
			_('Opacity of every frosted surface, on the login card and in the admin UI'));
		o.value('0.2', '0.20');
		o.value('0.3', '0.30');
		o.value('0.4', '0.40');
		o.value('0.5', '0.50');
		o.value('0.6', '0.60');
		o.value('0.7', '0.70');
		o.value('0.8', '0.80');
		o.default = '0.5';
		o.rmempty = false;

		o = s.option(form.ListValue, 'glass_blur', _('Global blur'),
			_('Backdrop blur radius applied to the login card and every frosted panel'));
		o.value('0', '0 px');
		o.value('6', '6 px');
		o.value('10', '10 px');
		o.value('14', '14 px');
		o.value('18', '18 px');
		o.value('22', '22 px');
		o.value('26', '26 px');
		o.value('30', '30 px');
		o.default = '20';
		o.rmempty = false;

		o = s.option(form.Flag, 'auto_color', _('Accent color from background'),
			_('Pick a matching accent color from the current background image instead of the fixed primary color'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'mode', _('Theme mode'));
		o.value('normal', _('Follow system'));
		o.value('light', _('Light mode'));
		o.value('dark', _('Dark mode'));
		o.default = 'normal';
		o.rmempty = false;
		// A header shortcut saves independently of this form. Keep the widget and
		// its comparison value current, while leaving other pending fields alone.
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			const option = this;
			const node = form.ListValue.prototype.renderWidget.call(this, section_id, option_index, cfgvalue);
			const syncMode = (event) => {
				if (!node.isConnected) {
					window.removeEventListener('frost-appearance-saved', syncMode);
					return;
				}
				option.cfgvalue(section_id, event.detail.mode);
				L.dom.callClassMethod(node, 'setValue', event.detail.mode);
			};
			window.addEventListener('frost-appearance-saved', syncMode);
			return node;
		};

		o = s.option(form.ListValue, 'transparency', _('Login panel opacity'),
			_('0 transparent - 1 opaque (suggest: transparent: 0 or translucent preset: 0.5).'));
		for (const i of trans_set)
			o.value(i);
		o.default = '0.5';
		o.rmempty = false;

		o = s.option(form.Value, 'blur', _('Login panel blur'),
			_('Larger value will more blurred (suggest: clear: 1 or blur preset: 10).'));
		o.datatype = 'and(ufloat,range(0,100))';
		o.default = '10';
		o.rmempty = false;

		o = s.option(form.ListValue, 'dark_glass_mode', _('Dark mode login panel'),
			_('Use the same opacity and blur in both modes, or customize the dark login panel.'));
		o.value('inherit', _('Follow light mode'));
		o.value('custom', _('Custom'));
		o.default = 'inherit';
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			const mode = uci.get('frost', section_id, 'dark_glass_mode');
			if (mode === 'inherit' || mode === 'custom')
				return mode;
			const blur = uci.get('frost', section_id, 'blur') || '10';
			const opacity = uci.get('frost', section_id, 'transparency') || '0.5';
			const darkBlur = uci.get('frost', section_id, 'blur_dark');
			const darkOpacity = uci.get('frost', section_id, 'transparency_dark');
			return (darkBlur != null && +darkBlur !== +blur) ||
				(darkOpacity != null && +darkOpacity !== +opacity) ? 'custom' : 'inherit';
		};

		o = s.option(form.ListValue, 'transparency_dark', _('[Dark mode] Transparency'),
			_('0 transparent - 1 opaque (suggest: black translucent preset: 0.5).'));
		for (const i of trans_set)
			o.value(i);
		o.default = '0.5';
		o.rmempty = false;
		o.depends('dark_glass_mode', 'custom');
		o.retain = true;

		o = s.option(form.Value, 'blur_dark', _('[Dark mode] Frosted Glass Radius'),
			_('Larger value will more blurred (suggest: clear: 1 or blur preset: 10).'));
		o.datatype = 'and(ufloat,range(0,100))';
		o.default = '10';
		o.rmempty = false;
		o.depends('dark_glass_mode', 'custom');
		o.retain = true;

		o = s.option(form.Button, '_save', _('Save settings'));
		o.inputstyle = 'apply';
		o.inputtitle = _('Save current settings');
		o.onclick = function() {
			if (this.map.readonly)
				return Promise.resolve();
			return this.map.save(null, true).then(() => {
				return ui.changes.apply(true);
			}).catch((e) => {
				ui.addNotification(null, E('p', e.message));
			});
		};

		s = m.section(form.TypedSection);
		s.render = function() { return branding.render(this.map, data[3]); };

		s = m.section(form.TypedSection, null, _('Upload background (available space: %1024.2mB)')
			.format(data[1].avail * 1024),
			_('You can upload files such as gif/jpg/mp4/png/webm/webp files, to change the login page background. Recommended size: 1 MB or less, large images slow down the login page.'));
		s.addremove = false;
		s.anonymous = true;

		o = s.option(form.Button, '_upload_bg', _('Upload background'),
			_('Files will be uploaded to <code>%s</code>.').format(bg_path));
		o.inputstyle = 'action';
		o.inputtitle = _('Upload...');
		o.onclick = function(ev, section_id) {
			if (this.map.readonly)
				return Promise.resolve();
			const file = '/tmp/frost_background.tmp';
			let uploaded = false;
			return ui.uploadFile(file, ev.target).then((res) => {
				uploaded = true;
				return callRenameFrost(res.name).then((ret) => {
					if (ret.result === 0)
						return location.reload();
					throw new Error(_('Failed to upload file: %s.').format(res.name));
				});
			})
			.catch((e) => {
				ui.addNotification(null, E('p', e.message));
				if (uploaded)
					return L.resolveDefault(fs.remove(file));
			});
		};
		o.modalonly = true;

		s = m.section(form.TableSection);
		s.render = function() {
			const tbl = E('table', { 'class': 'table cbi-section-table' },
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, [ _('Filename') ]),
					E('th', { 'class': 'th' }, [ _('Modified date') ]),
					E('th', { 'class': 'th' }, [ _('Size') ]),
					E('th', { 'class': 'th' }, [ _('Action') ])
				])
			);

			cbi_update_table(tbl, data[2].map(L.bind((file) => {
				return [
					file.name,
					new Date(file.mtime * 1000).toLocaleString(),
					String.format('%1024.2mB', file.size),
					E('button', {
						'class': 'btn cbi-button cbi-button-remove',
						'disabled': this.map.readonly || null,
						'click': ui.createHandlerFn(this, () => {
							if (this.map.readonly)
								return Promise.resolve();
							return callRemoveFrost(file.name).then((ret) => {
								if (ret.result === 0)
									return location.reload();
								throw new Error(_('Failed to delete file: %s.').format(file.name));
							}).catch((e) => {
								ui.addNotification(null, E('p', e.message));
							});
						})
					}, [ _('Delete') ])
				];
			}, this)), E('em', _('No files found.')));

			return E('div', { 'class': 'cbi-section', 'id': 'cbi-filelist' }, [
				E('h3', _('Background file list')),
				tbl
			]);
		};

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
