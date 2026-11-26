#
# Copyright (C) 2008-2019 Jerrykuku
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Frost Theme
LUCI_DEPENDS:=+wget-any +jsonfilter +ucode-mod-math
LUCI_BASENAME:=frost-config

PKG_VERSION:=3.1.4
PKG_PO_VERSION:=3.1.4
PKG_RELEASE:=20261179
PKG_PROVIDES:=luci-app-frost-config

PKG_LICENSE:=Apache-2.0 MIT

LUCI_MINIFY_CSS:=0
# Ship template source across stable and snapshot runtimes. Precompiled
# bytecode would require the SDK's ucode format (see issue #715).
LUCI_MINIFY_UT:=0

define Package/luci-theme-frost/conffiles
/etc/config/frost
/www/luci-static/frost/background/
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
