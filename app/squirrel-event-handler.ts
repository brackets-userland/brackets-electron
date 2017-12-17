/* eslint-env node */

import { app } from "electron";
import { spawn } from "child_process";
import { getLogger } from "./utils";
import * as path from "path";

const log = getLogger("squirrel-event-handler");

function spawnUpdate(args: string[]): Promise<void> {
    return new Promise<void>((resolve) => {

        const appFolder = path.resolve(process.execPath, "..");
        const rootAtomFolder = path.resolve(appFolder, "..");
        const updateDotExe = path.resolve(path.join(rootAtomFolder, "Update.exe"));
        const exeName = path.basename(process.execPath);

        args.push(exeName);

        log.info(`Spawning '${updateDotExe}' with args '${args}'`);
        spawn(updateDotExe, args, { detached: true })
            .on("close", resolve);

    }).catch((err) => log.error(err));
}

// Optionally do things such as:
// - Add your .exe to the PATH
// - Write to the registry for things like file associations and explorer context menus
function handleInstall(squirrelCommand: string): boolean {
    log.info(`Processing squirrel command '${squirrelCommand}'`);

    // Install desktop and start menu shortcuts
    spawnUpdate(["--createShortcut"])
    // Quit after shortcut has been created
        .then(app.quit);

    return true;
}

// Undo anything you did in the --squirrel-install and --squirrel-updated handlers
function handleUninstall(squirrelCommand: string): boolean {
    log.info(`Processing squirrel command '${squirrelCommand}'`);

    // Remove desktop and start menu shortcuts
    spawnUpdate(["--removeShortcut"])
    // Quit after shortcut has been removed
        .then(app.quit);

    return true;
}

// This is called on the outgoing version of your app before
// we update to the new version - it's the opposite of
// --squirrel-updated
function handleObsolete(squirrelCommand: string): boolean {
    log.info(`Processing squirrel command '${squirrelCommand}'`);
    app.quit();
    return true;
}

export function handleStartupEvent(): boolean {
    if (process.platform !== "win32" || process.argv.length === 1) {
        return false;
    }
    const squirrelCommand = process.argv[1];
    switch (squirrelCommand) {
        case "--squirrel-install":
        case "--squirrel-updated":
            return handleInstall(squirrelCommand);
        case "--squirrel-uninstall":
            return handleUninstall(squirrelCommand);
        case "--squirrel-obsolete":
            return handleObsolete(squirrelCommand);
        default:
            return false;
    }
}
