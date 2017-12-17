import * as os from "os";
import { app, autoUpdater, ipcMain } from "electron";
import { getLogger, isDev } from "./utils";

const log = getLogger("auto-updater");
export const UPDATE_SERVER_HOST = "brackets-electron-nuts.herokuapp.com";

function notify(window: Electron.BrowserWindow, title: string, message: string) {
    window.webContents.send("notify", title, message);
}

export default class AppUpdater {
    constructor(window: Electron.BrowserWindow) {
        if (isDev()) {
            log.info(`isDev() true, auto-updater disabled`);
            return;
        }

        const version = app.getVersion();
        const feedUrl = `https://${UPDATE_SERVER_HOST}/update/${os.platform()}/${version}`;

        try {
            autoUpdater.setFeedURL(feedUrl);
        } catch (err) {
            log.info(`autoUpdater.setFeedURL failed: ${err}`);
            return;
        }

        autoUpdater.addListener("update-available", (event: any) => {
            log.info("A new update is available");
        });
        autoUpdater.addListener(
            "update-downloaded",
            (event: Event, releaseNotes: string, releaseName: string, releaseDate: Date, updateURL: string) => {
                notify(
                    window,
                    "A new update is ready to install",
                    `Version ${releaseName} is downloaded and will be automatically installed on Quit`
                );
            }
        );
        autoUpdater.addListener("error", (error: any) => {
            // auto-updater fails a lot because builds are not being signed yet, just ignore
            //
            // if (error.message === "Can not find Squirrel") {
            //     return;
            // }
            // log.error(error.stack ? error.stack : error.toString());
        });
        autoUpdater.addListener("checking-for-update", (event: any) => {
            log.info("checking-for-update");
        });
        autoUpdater.addListener("update-not-available", () => {
            log.info("update-not-available");
        });
        ipcMain.on("brackets-app-ready", () => {
            autoUpdater.checkForUpdates();
        });
    }
}
