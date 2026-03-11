var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
    await Zotero.initializationPromise;

    if (!rootURI) {
        rootURI = resourceURI.spec;
    }

    // Register chrome
    var am = Cc["@mozilla.org/addons/addon-manager-startup;1"]
        .getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = am.registerChrome(manifestURI, [
        ["content", "mineru", rootURI + "chrome/content/"]
    ]);

    // Initialize function
    var initMinerU = function() {
        var win = Zotero.getMainWindow();
        if (!win || !win.document) {
            return false; // Not ready yet
        }

        // Check if already initialized
        if (win.document.getElementById("mineru-convert-menu")) {
            return true; // Already done
        }

        // Load script if not already loaded
        if (typeof Zotero.mineru === 'undefined') {
            var scope = { rootURI: rootURI };
            try {
                Services.scriptloader.loadSubScript(rootURI + "chrome/content/scripts/mineru.js", scope);
            } catch (e) {
                dump("[MinerU] Load failed: " + e + "\n");
                return false;
            }
        }

        // Setup menu
        if (Zotero.mineru && Zotero.mineru.setupMenu) {
            try {
                Zotero.mineru.setupMenu(win);
                dump("[MinerU] Menu setup done\n");
                return true;
            } catch (e) {
                dump("[MinerU] Setup failed: " + e + "\n");
                return false;
            }
        }
        return false;
    };

    // Try immediately
    if (!initMinerU()) {
        // Retry until success
        var attempts = 0;
        var retry = function() {
            attempts++;
            if (initMinerU()) {
                dump("[MinerU] Success after " + attempts + " tries\n");
            } else if (attempts < 30) {
                setTimeout(retry, 300);
            }
        };
        setTimeout(retry, 300);
    }
}

async function onMainWindowLoad({ window }) {
    if (Zotero.mineru && Zotero.mineru.hooks && Zotero.mineru.hooks.onMainWindowLoad) {
        Zotero.mineru.hooks.onMainWindowLoad(window);
    }
}

async function onMainWindowUnload({ window }) {
    if (Zotero.mineru && Zotero.mineru.hooks && Zotero.mineru.hooks.onMainWindowUnload) {
        Zotero.mineru.hooks.onMainWindowUnload(window);
    }
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
    if (reason === APP_SHUTDOWN) return;

    if (Zotero.mineru && Zotero.mineru.hooks && Zotero.mineru.hooks.shutdown) {
        try {
            Zotero.mineru.hooks.shutdown();
        } catch (e) {}
    }

    if (rootURI) {
        try {
            Cu.unload(rootURI + "chrome/content/scripts/mineru.js");
        } catch (e) {}
    }

    if (chromeHandle) {
        chromeHandle.destruct();
        chromeHandle = null;
    }
}

function uninstall(data, reason) {}
