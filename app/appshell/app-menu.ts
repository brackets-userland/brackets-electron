/* eslint no-undef:0 */
/* tslint:disable:no-empty-interface */
/* globals Electron, process */

interface MenuItemOptions extends Electron.MenuItemConstructorOptions {}

import * as _ from "lodash";
import * as assert from "assert";
import { app, Menu } from "electron";
import * as shell from "./shell";

const menuTemplate: MenuItemOptions[] = [];

export const ERR_NOT_FOUND = "NOTFOUND";

app.on("browser-window-focus", function () {
    _refreshMenu();
});
app.on("browser-window-blur", function () {
    _refreshMenu();
});

let currentShortcuts: { [accelerator: string]: string } = {};

function registerShortcuts(win: Electron.BrowserWindow, menuItem: MenuItemOptions) {
    if (menuItem.accelerator && menuItem.id) {
        currentShortcuts[menuItem.accelerator as string] = menuItem.id;
    }
    if (Array.isArray(menuItem.submenu)) {
        menuItem.submenu.forEach((i) => registerShortcuts(win, i));
    }
}

const __refreshMenu = _.debounce(function () {
    Menu.setApplicationMenu(Menu.buildFromTemplate(_.cloneDeep(menuTemplate)));
    const mainWindow = shell.getMainWindow();
    if (mainWindow.isFocused()) {
        currentShortcuts = {};
        menuTemplate.forEach((menuItem) => registerShortcuts(mainWindow, menuItem));
        mainWindow.webContents.send("updateShortcuts", JSON.stringify(currentShortcuts));
    }
}, 100);

function _refreshMenu(callback?: () => void) {
    __refreshMenu();
    if (callback) {
        process.nextTick(callback);
    }
}

function _findMenuItemPosition(
    id: string, where: MenuItemOptions[] = menuTemplate, whereId: string = ""
): [string, number] | null {
    const result = _.find(where, { id });
    if (result) {
        return [whereId, _.findIndex(where, { id })];
    }
    const results = _.compact(where.map(function (menuItem) {
        return menuItem.submenu ? _findMenuItemPosition(id, menuItem.submenu as MenuItemOptions[], menuItem.id) : null;
    }));
    return results.length > 0 ? results[0] : null;
}

function _deleteMenuItemById(id: string, where: MenuItemOptions[] = menuTemplate): boolean {
    const result = _.findIndex(where, { id });
    if (result !== -1) {
        where.splice(result, 1);
        return true;
    }
    const deleted = where.map(function (menuItem) {
        return menuItem.submenu ? _deleteMenuItemById(id, menuItem.submenu as MenuItemOptions[]) : null;
    }).filter((x) => x === true);
    return deleted.length > 0 ? true : false;
}

function _findMenuItemById(id: string, where: MenuItemOptions[] = menuTemplate): MenuItemOptions | null {
    const result = _.find(where, { id });
    if (result) {
        return result;
    }
    const results = _.compact(where.map(function (menuItem) {
        return menuItem.submenu ? _findMenuItemById(id, menuItem.submenu as MenuItemOptions[]) : null;
    }));
    return results.length > 0 ? results[0] : null;
}

function _addToPosition(
    obj: MenuItemOptions,
    target: MenuItemOptions[],
    position: string,
    relativeId: string | null
): string | null {
    let retVal: string | null = null;
    if (position === "first") {
        target.unshift(obj);
    } else if (position === "last") {
        target.push(obj);
    } else if (
        position === "before" || position === "after" || position === "firstInSection" || position === "lastInSection"
    ) {
        let idx = _.findIndex(target, {id: relativeId});
        let idxSection: number;
        if (idx === -1) {
            // NOTE: original behaviour - if relativeId wasn't found
            // menu should be put to the end of the list
            console.warn("menu item with id: " + relativeId + " was not found, adding entry to the end of the list");
            retVal = ERR_NOT_FOUND;
            idx = target.length;
        }
        if (position === "firstInSection") {
            idxSection = _.findLastIndex(target, (o: MenuItemOptions, i: number) => {
                return i < idx && o.type === "separator";
            });
            idx = idxSection + 1;
        }
        if (position === "lastInSection") {
            idxSection = _.findIndex(target, (o: MenuItemOptions, i: number) => {
                return i >= idx && o.type === "separator";
            });
            idx = idxSection === -1 ? target.length : idxSection;
        }
        if (position === "after") {
            idx++;
        }
        target.splice(idx, 0, obj);
    } else {
        throw new Error("position not implemented in _addToPosition: " + position);
    }
    return retVal;
}

function _fixBracketsKeyboardShortcut(shortcut: string): string {
    if (shortcut.trim() === "") {
        return "";
    }

    shortcut = shortcut.replace(/-/g, "+");
    shortcut = shortcut.replace(/\+$/g, "Plus");
    shortcut = shortcut.replace(/\u2190/g, "Left");
    shortcut = shortcut.replace(/\u2191/g, "Up");
    shortcut = shortcut.replace(/\u2192/g, "Right");
    shortcut = shortcut.replace(/\u2193/g, "Down");
    shortcut = shortcut.replace(/\u2212/g, "-");

    if (!shortcut.match(/^[\x00-\x7F]+$/)) {
        console.error("Non ASCII keyboard shortcut used: " + shortcut);
        return "";
    }

    return shortcut;
}

export function addMenu(title: string, id: string, position: string, relativeId: string, callback: () => void) {
    assert(title && typeof title === "string", "title must be a string");
    assert(id && typeof id === "string", "id must be a string");
    assert(!position || position && typeof position === "string", "position must be a string");
    assert(!relativeId || relativeId && typeof relativeId === "string", "relativeId must be a string");
    assert(typeof callback === "function", "callback must be a function");
    process.nextTick(function () {
        const newObj = { id, label: title };
        const err = _addToPosition(newObj, menuTemplate, position || "last", relativeId);
        _refreshMenu(callback.bind(null, err));
    });
}

export function addMenuItem(
    parentId: string,
    title: string,
    id: string,
    key: string | null,
    displayStr: string | null,
    position: string | null,
    relativeId: string | null,
    callback: (err?: string | null) => void
) {
    assert(parentId && typeof parentId === "string", "parentId must be a string");
    assert(title && typeof title === "string", "title must be a string");
    assert(id && typeof id === "string", "id must be a string");
    assert(!key || key && typeof key === "string", "key must be a string");
    assert(!displayStr || displayStr && typeof displayStr === "string", "displayStr must be a string");
    assert(!position || position && typeof position === "string", "position must be a string");
    assert(!relativeId || relativeId && typeof relativeId === "string", "relativeId must be a string");
    assert(typeof callback === "function", "callback must be a function");
    process.nextTick(function () {
        if (typeof key === "string") {
            key = _fixBracketsKeyboardShortcut(key);
        }

        const isSeparator = title === "---";
        const newObj: MenuItemOptions = {
            type: isSeparator ? "separator" : "normal",
            id,
            label: title,
            click: () => shell.getMainWindow().webContents.send("executeCommand", id)
        };

        if (key) {
            newObj.accelerator = key;
        }

        const parentObj = _findMenuItemById(parentId);
        if (!parentObj) {
            return process.nextTick(function () {
                callback(ERR_NOT_FOUND);
            });
        }

        if (!parentObj.submenu) {
            parentObj.submenu = [];
        }

        const err = _addToPosition(newObj, parentObj.submenu as MenuItemOptions[], position || "last", relativeId);
        _refreshMenu(callback.bind(null, err));
    });
}

export function getMenuItemState(
    commandId: string,
    callback: (err?: string | null, enabled?: boolean, checked?: boolean) => void
) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        callback(null, obj.enabled === true, obj.checked === true);
    });
}

export function getMenuPosition(
    commandId: string,
    callback: (err?: string | null, parentId?: string, position?: number) => void
) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const res = _findMenuItemPosition(commandId);
        return res ? callback(null, res[0], res[1]) : callback(null);
    });
}

export function getMenuTitle(commandId: string, callback: (err?: string | null, title?: string) => void) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        callback(null, obj.label);
    });
}

export function removeMenu(commandId: string, callback: (err?: string | null, deleted?: boolean) => void) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const deleted = _deleteMenuItemById(commandId);
        _refreshMenu(callback.bind(null, deleted ? null : ERR_NOT_FOUND));
    });
}

export function removeMenuItem(commandId: string, callback: (err?: string | null, deleted?: boolean) => void) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const deleted = _deleteMenuItemById(commandId);
        _refreshMenu(callback.bind(null, deleted ? null : ERR_NOT_FOUND));
    });
}

export function setMenuItemShortcut(
    commandId: string,
    shortcut: string,
    displayStr: string,
    callback: (err?: string | null) => void
) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    assert(shortcut && typeof shortcut === "string", "shortcut must be a string");
    process.nextTick(function () {
        shortcut = _fixBracketsKeyboardShortcut(shortcut);
        const obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        if (shortcut) {
            obj.accelerator = shortcut;
        } else {
            delete obj.accelerator;
        }
        _refreshMenu(callback.bind(null, null));
    });
}

export function setMenuItemState(
    commandId: string,
    enabled: boolean,
    checked: boolean,
    callback: (err?: string | null) => void
) {
    assert(typeof enabled === "boolean", "enabled must be a boolean");
    assert(typeof checked === "boolean", "checked must be a boolean");
    process.nextTick(function () {
        const obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }

        obj.enabled = enabled;
        obj.checked = checked;

        if (checked) {
            // TODO: Change addMenuItem to set the type (checkbox, radio, ... submenu)
            obj.type = "checkbox";
        }
        _refreshMenu(callback.bind(null, null));
    });
}

export function setMenuTitle(
    commandId: string,
    title: string,
    callback: (err?: string | null) => void
) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    assert(title && typeof title === "string", "title must be a string");
    process.nextTick(function () {
        const obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        obj.label = title;
        _refreshMenu(callback.bind(null, null));
    });
}
