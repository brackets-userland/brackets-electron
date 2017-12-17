/* eslint-env node */

import { log } from "./logging";
import DomainManager from "./domain-manager";

// load the base domain
DomainManager.loadDomainModulesFromPaths(["./BaseDomain"], false);

(process as NodeJS.EventEmitter).on("message", async function (obj: any) {
    const _type: string = obj.type;
    switch (_type) {
        case "message":
            DomainManager._receive(obj.message);
            break;
        default:
            log.warn(`no handler for ${_type}`);
    }
});

(process as NodeJS.EventEmitter).on("uncaughtException", (err: Error) => {
    log.error(`uncaughtException: ${err.stack}`);
    process.exit(1);
});
