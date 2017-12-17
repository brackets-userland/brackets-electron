// define(function (require, exports, module) {
    "use strict";

    // Load dependent modules
    import AppInit        = require("utils/AppInit");
    import CommandManager = require("command/CommandManager");
    import Commands       = require("command/Commands");

    let appReady = false; // Set to true after app is fully initialized
    let appShortcuts: { [shortcut: string]: string } = {};

    electron.ipcRenderer.on("updateShortcuts", function (evt: any, data: string) {
        appShortcuts = JSON.parse(data);
    });

    function executeCommand(eventName: string) {
        // Temporary fix for #2616 - don't execute the command if a modal dialog is open.
        // This should really be fixed with proper menu enabling.
        if ($(".modal.instance").length || !appReady) {
            // Another hack to fix issue #3219 so that all test windows are closed
            // as before the fix for #3152 has been introduced. isBracketsTestWindow
            // property is explicitly set in createTestWindowAndRun() in SpecRunnerUtils.js.
            if ((window as any).isBracketsTestWindow) {
                return false;
            }
            // Return false for all commands except file.close_window command for
            // which we have to return true (issue #3152).
            return (eventName === Commands.FILE_CLOSE_WINDOW);
        }

        const promise = CommandManager.execute(eventName);
        return (promise && promise.state() === "rejected") ? false : true;
    }

    (window as any).triggerKeyboardShortcut = (shortcut: string) => {
        const normalized = shortcut.replace(/-/g, "+");
        if (appShortcuts[normalized]) {
            return executeCommand(appShortcuts[normalized]);
        }
        return null;
    };

    electron.ipcRenderer.on("executeCommand", function (evt: any, eventName: string) {
        return executeCommand(eventName);
    });

    electron.ipcRenderer.on("console-msg", function (evt: any, method: string, ...args: string[]) {
        (console as any)[method]("[shell]", ...args);
    });

    electron.ipcRenderer.on("notify", function (evt: any, title: string, message: string) {
        window.alert(`${title}\n\n${message}`);
    });

    AppInit.appReady(function () {
        electron.ipcRenderer.send("brackets-app-ready");
        appReady = true;
    });

// });
