/* eslint-env node */

import * as assert from "assert";
import * as pathLib from "path";
import * as utils from "../utils";
import { remote, shell } from "electron";

const app = remote.app;
const REMOTE_DEBUGGING_PORT = 9234; // TODO: this is hardcoded in brackets-shell
const startupTime = process.hrtime();

export const ERR_NOT_FOUND = "NOTFOUND";
// TODO: cleanup unused below
export const ERR_CL_TOOLS_CANCELLED = 12;
export const ERR_CL_TOOLS_MKDIRFAILED = 14;
export const ERR_CL_TOOLS_NOTSUPPORTED = 17;
export const ERR_CL_TOOLS_RMFAILED = 13;
export const ERR_CL_TOOLS_SERVFAILED = 16;
export const ERR_CL_TOOLS_SYMLINKFAILED = 15;
export const ERR_NODE_FAILED = -3;
export const ERR_NODE_NOT_YET_STARTED = -1;
export const ERR_NODE_PORT_NOT_YET_SET = -2;
// TODO: this should be changeable
export const language = "en";

export function closeLiveBrowser(callback: (err?: Error) => void) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.closeLiveBrowser not implemented"));
    });
}

export function dragWindow() {
    // TODO: implement
    throw new Error("app.dragWindow not implemented");
}

export function getApplicationSupportDirectory() {
    return utils.convertWindowsPathToUnixPath(app.getPath("userData"));
}

export function getExtensionsFolder() {
    return utils.convertWindowsPathToUnixPath(
        pathLib.resolve(getApplicationSupportDirectory(), "extensions")
    );
}

// TODO: it seems that both arguments aren't needed anymore
export function showExtensionsFolder(appURL: any, callback: (err?: Error) => void) {
    process.nextTick(function () {
        shell.showItemInFolder(utils.convertBracketsPathToWindowsPath(getExtensionsFolder()));
        if (callback) { callback(); }
    });
}

export function getDroppedFiles(callback: (err?: Error) => void) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.getDroppedFiles not implemented"));
    });
}

// return the number of milliseconds that have elapsed since the application was launched
export function getElapsedMilliseconds() {
    const diff = process.hrtime(startupTime);
    // diff = [ seconds, nanoseconds ]
    return diff[0] * 1000 + diff[1] / 1000000;
}

export function getPendingFilesToOpen(callback: (err?: Error, filePaths?: string[]) => void) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.getPendingFilesToOpen not implemented"), []);
    });
}

export function getRemoteDebuggingPort(): number {
    return REMOTE_DEBUGGING_PORT;
}

export function getUserHomeDirectory(): string {
    return utils.convertWindowsPathToUnixPath(app.getPath("home"));
}

export function getUserDocumentsDirectory(): string {
    return utils.convertWindowsPathToUnixPath(app.getPath("documents"));
}

export function installCommandLine(callback: (err?: Error) => void): void {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.installCommandLine not implemented"));
    });
}

export function openLiveBrowser(
    url: string,
    enableRemoteDebugging: boolean,
    callback: (err?: Error) => void
) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.openLiveBrowser not implemented" + url));
    });
}

export function openURLInDefaultBrowser(
    url: string,
    callback: (err?: Error) => void
) {
    assert(url && typeof url === "string", "url must be a string");
    process.nextTick(function () {
        shell.openExternal(url);
        if (callback) {
            callback();
        }
    });
}

export function quit() {
    // close current window, shell will quit when all windows are closed
    remote.getCurrentWindow().close();
}

export function showDeveloperTools() {
    const win = remote.getCurrentWindow();
    win.webContents.openDevTools({ mode: "detach" });
}

// TODO: get rid of callback? This call is not throwing any error.
export function showOSFolder(
    path: string,
    callback: () => void
): void {
    process.nextTick(function () {
        shell.showItemInFolder(utils.convertBracketsPathToWindowsPath(path));
        if (callback) { callback(); }
    });
}
