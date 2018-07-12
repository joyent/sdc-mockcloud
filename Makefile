#
# Copyright (c) 2018, Joyent, Inc.
#

NAME=mockcloud

JS_FILES := $(shell find lib -name '*.js')
ESLINT_FILES := $(JS_FILES)
CLEAN_FILES += ./node_modules

# We are including Triton agents as deps. Some of them include npm postinstall
# scripts for use when installing those agents via `apm install` on a TritonDC
# CN itself. We do *not* want to run these scripts for the `npm install` here.
NPM_ENV = SDC_AGENT_SKIP_LIFECYCLE=yes MAKE_OVERRIDES='CTFCONVERT=/bin/true CTFMERGE=/bin/true'

ifeq ($(shell uname -s),SunOS)
	# sdcnode: use a recent node version (v6 for now) and recent
	# triton-origin image (multiarch@18.1.0 is being explored now).
	NODE_PREBUILT_VERSION=v6.14.3
	NODE_PREBUILT_TAG=zone
        # minimal-multiarch 18.1.0
	NODE_PREBUILT_IMAGE = 1ad363ec-3b83-11e8-8521-2f68a4a34d5d
endif


#
# Included definitions
#
include ./tools/mk/Makefile.defs
include ./tools/mk/Makefile.node_modules.defs
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.defs
else
	NPM_EXEC :=
	NPM = npm
endif
include ./tools/mk/Makefile.smf.defs

RELEASE_TARBALL = $(NAME)-pkg-$(STAMP).tar.bz2
RELSTAGEDIR := /tmp/$(STAMP)


#
# Repo-specific targets
#
.PHONY: all
all: $(STAMP_NODE_MODULES)

.PHONY: git-hooks
git-hooks:
	ln -sf ../../tools/pre-commit.sh .git/hooks/pre-commit

.PHONY: fmt
fmt:: | $(ESLINT)
	$(ESLINT) --fix $(ESLINT_FILES)

.PHONY: release
release: all
	@echo "Building $(RELEASE_TARBALL)"
	mkdir -p $(RELSTAGEDIR)/root/opt/triton/$(NAME)
	cp -PR \
		$(TOP)/lib \
		$(TOP)/node_modules \
		$(TOP)/package.json \
		$(RELSTAGEDIR)/root/opt/triton/$(NAME)
	mkdir -p $(RELSTAGEDIR)/root/opt/triton/$(NAME)/build
	# sdcnode
	cp -PR \
		$(TOP)/build/node \
		$(RELSTAGEDIR)/root/opt/triton/$(NAME)/build
	# Trim node
	rm -rf \
		$(RELSTAGEDIR)/root/opt/triton/$(NAME)/build/node/bin/npm \
		$(RELSTAGEDIR)/root/opt/triton/$(NAME)/build/node/lib/node_modules \
		$(RELSTAGEDIR)/root/opt/triton/$(NAME)/build/node/include \
		$(RELSTAGEDIR)/root/opt/triton/$(NAME)/build/node/share
	# Tar
	(cd $(RELSTAGEDIR) && $(TAR) -jcf $(TOP)/$(RELEASE_TARBALL) root)
	@rm -rf $(RELSTAGEDIR)

publish:
	@if [[ -z "$(BITS_DIR)" ]]; then \
		echo "error: 'BITS_DIR' must be set for 'publish' target"; \
		exit 1; \
	fi
	mkdir -p $(BITS_DIR)/$(NAME)
	cp $(RELEASE_TARBALL) $(BITS_DIR)/$(NAME)/$(RELEASE_TARBALL)


#
# Includes
#
include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.node_modules.targ
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
endif
include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.targ
