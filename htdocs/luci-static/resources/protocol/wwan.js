'use strict';
'require baseclass';

/*
 * The image ships the legacy "wwan" netifd protocol handler, but current LuCI
 * no longer provides a JS counterpart for it, so the network page requests a
 * missing protocol/wwan.js and logs a 404. This stub keeps the lookup quiet;
 * ModemManager/qmi/mbim are the supported dial-up paths.
 */
return baseclass.extend({
	__name__: 'Protocol.wwan'
});
