/// <amd-dependency path="module" name="module"/>

import FileSystemStatsType from "../../../types/FileSystemStats";

// define(function (require, exports, module) {

    import FileUtils       = require("file/FileUtils");
    import FileSystemStats = require("filesystem/FileSystemStats");
    import FileSystemError = require("filesystem/FileSystemError");
    import NodeDomain      = require("utils/NodeDomain");

    /**
     * @const
     */
    const FILE_WATCHER_BATCH_TIMEOUT = 200;   // 200ms - granularity of file watcher changes

    /**
     * Callback to notify FileSystem of watcher changes
     * @type {?function(string, FileSystemStats=)}
     */
    let _changeCallback: Function | null;

    /**
     * Callback to notify FileSystem if watchers stop working entirely
     * @type {?function()}
     */
    let _offlineCallback: Function | null;

    /** Timeout used to batch up file watcher changes (setTimeout() return value) */
    let _changeTimeout: number | null;

    /**
     * Pending file watcher changes - map from fullPath to flag indicating whether we need to pass stats
     * to _changeCallback() for this path.
     * @type {!Object.<string, boolean>}
     */
    let _pendingChanges: { [path: string]: FileSystemStatsType | null } = {};

    const _bracketsPath = FileUtils.getNativeBracketsDirectoryPath();
    const _modulePath   = FileUtils.getNativeModuleDirectoryPath(module);
    const _nodePath     = "node/FileWatcherDomain";
    const _domainPath   = [_bracketsPath, _modulePath, _nodePath].join("/");
    const _nodeDomain   = new NodeDomain("fileWatcher", _domainPath);

    // If the connection closes, notify the FileSystem that watchers have gone offline.
    _nodeDomain.connection.on("close", (event: any, reconnectPromise?: JQueryPromise<any>) => {
        if (_offlineCallback) {
            _offlineCallback();
        }
    });

    /**
     * Enqueue a file change event for eventual reporting back to the FileSystem.
     *
     * @param {string} changedPath The path that was changed
     * @param {object} stats Stats coming from the underlying watcher, if available
     * @private
     */
    function _enqueueChange(changedPath: string, stats: FileSystemStatsType | null) {
        _pendingChanges[changedPath] = stats;
        if (!_changeTimeout) {
            _changeTimeout = window.setTimeout(() => {
                if (_changeCallback) {
                    for (const path of Object.keys(_pendingChanges)) {
                        _changeCallback(path, _pendingChanges[path]);
                    }
                }
                _changeTimeout = null;
                _pendingChanges = {};
            }, FILE_WATCHER_BATCH_TIMEOUT);
        }
    }

    /**
     * Event handler for the Node fileWatcher domain's change event.
     *
     * @param {jQuery.Event} The underlying change event
     * @param {string} event The type of the event: "changed", "created" or "deleted"
     * @param {string} parentDirPath The path to the directory holding entry that has changed
     * @param {string=} entryName The name of the file/directory that has changed
     * @param {object} statsObj Object that can be used to construct FileSystemStats
     * @private
     */
    function _fileWatcherChange(evt: any, event: string, parentDirPath: string, entryName: string, statsObj: any) {
        switch (event) {
            case "changed":
                // an existing file/directory was modified; stats are passed if available
                let fsStats: FileSystemStatsType | null = null;
                if (statsObj) {
                    fsStats = new FileSystemStats(statsObj);
                } else {
                    console.warn("FileWatcherDomain was expected to deliver stats for changed event!");
                }
                _enqueueChange(parentDirPath + entryName, fsStats);
                break;
            case "created":
            case "deleted":
                // file/directory was created/deleted; fire change on parent to reload contents
                _enqueueChange(parentDirPath, null);
                break;
            default:
                console.error("Unexpected 'change' event:", event);
        }
    }

    // Setup the change handler. This only needs to happen once.
    _nodeDomain.on("change", _fileWatcherChange);

    /**
     * Convert appshell error codes to FileSystemError values.
     *
     * @param {?number} err An appshell error code
     * @return {?string} A FileSystemError string, or null if there was no error code.
     * @private
     */
    function _mapError(err: NodeJS.ErrnoException | null): string | NodeJS.ErrnoException | null {
        if (!err) {
            return null;
        }

        switch (err.code) {
            case "EEXIST":
                return FileSystemError.ALREADY_EXISTS;
            case "ENOENT":
            case "ENOTDIR":
                return FileSystemError.NOT_FOUND;
            case "ENOSPC":
                return FileSystemError.OUT_OF_SPACE;
            case "ECHARSET":
                return FileSystemError.UNSUPPORTED_ENCODING;
            case "EISDIR":
            case "EPERM":
            case "EACCES":
            case "EROFS":
                return FileSystemError.PERM_DENIED;
            default:
                console.warn("got error from fs, but no FileSystemError mapping was found: " + err);
        }

        // do not actually return FileSystemError.UNKNOWN
        // it has no point hiding what the actual error is
        return err;
    }

    /**
     * Convert a callback to one that transforms its first parameter from an
     * appshell error code to a FileSystemError string.
     *
     * @param {function(?number)} cb A callback that expects an appshell error code
     * @return {function(?string)} A callback that expects a FileSystemError string
     * @private
     */
    function _wrap(cb: Function) {
        return function (err: NodeJS.ErrnoException | null, ...rest: any[]) {
            cb(_mapError(err), ...rest);
        };
    }

    /**
     * Display an open-files dialog to the user and call back asynchronously with
     * either a FileSystmError string or an array of path strings, which indicate
     * the entry or entries selected.
     *
     * @param {boolean} allowMultipleSelection
     * @param {boolean} chooseDirectories
     * @param {string} title
     * @param {string} initialPath
     * @param {Array.<string>=} fileTypes
     * @param {function(?string, Array.<string>=)} callback
     */
    function showOpenDialog(
        allowMultipleSelection: boolean,
        chooseDirectories: boolean,
        title: string,
        initialPath: string,
        fileTypes: string[],
        callback: Function
    ) {
        appshell.fs.showOpenDialog(
            allowMultipleSelection, chooseDirectories, title, initialPath, fileTypes, _wrap(callback)
        );
    }

    /**
     * Display a save-file dialog and call back asynchronously with either a
     * FileSystemError string or the path to which the user has chosen to save
     * the file. If the dialog is cancelled, the path string will be empty.
     *
     * @param {string} title
     * @param {string} initialPath
     * @param {string} proposedNewFilename
     * @param {function(?string, string=)} callback
     */
    function showSaveDialog(
        title: string,
        initialPath: string,
        proposedNewFilename: string,
        callback: Function
    ) {
        appshell.fs.showSaveDialog(title, initialPath, proposedNewFilename, _wrap(callback));
    }

    /**
     * Stat the file or directory at the given path, calling back
     * asynchronously with either a FileSystemError string or the entry's
     * associated FileSystemStats object.
     *
     * @param {string} path
     * @param {function(?string, FileSystemStats=)} callback
     */
    function _convertNodeStats(stats: any): FileSystemStatsType {
        return new FileSystemStats({
            isFile: stats.isFile(),
            mtime: stats.mtime,
            size: stats.size,
            realPath: stats.realPath,
            hash: stats.mtime.getTime()
        });
    }
    function stat(path: string, callback: Function) {
        appshell.fs.lstat(path, function (err: NodeJS.ErrnoException, stats: any) {
            if (err) {
                return callback(_mapError(err));
            }
            if (stats.isSymbolicLink()) {
                // TODO: Implement realPath. If "filename" is a symlink,
                // realPath should be the actual path to the linked object.
                return callback(new Error("realPath for symbolic link is not implemented in appshell.fs.stat"));
            }
            callback(null, _convertNodeStats(stats));
        });
    }
    function statSync(path: string): FileSystemStatsType {
        let stats: any;
        try {
            stats = appshell.fs.lstatSync(path);
        } catch (err) {
            throw _mapError(err);
        }
        if (stats.isSymbolicLink()) {
            // TODO: Implement realPath. If "filename" is a symlink,
            // realPath should be the actual path to the linked object.
            throw new Error("realPath for symbolic link is not implemented in appshell.fs.stat");
        }
        return _convertNodeStats(stats);
    }

    /**
     * Determine whether a file or directory exists at the given path by calling
     * back asynchronously with either a FileSystemError string or a boolean,
     * which is true if the file exists and false otherwise. The error will never
     * be FileSystemError.NOT_FOUND; in that case, there will be no error and the
     * boolean parameter will be false.
     *
     * @param {string} path
     * @param {function(?string, boolean)} callback
     */
    function exists(path: string, callback: Function) {
        stat(path, function (err: NodeJS.ErrnoException) {
            if (err) {
                if (err === FileSystemError.NOT_FOUND) {
                    callback(null, false);
                } else {
                    callback(err);
                }
                return;
            }

            callback(null, true);
        });
    }

    /**
     * Read the contents of the directory at the given path, calling back
     * asynchronously either with a FileSystemError string or an array of
     * FileSystemEntry objects along with another consistent array, each index
     * of which either contains a FileSystemStats object for the corresponding
     * FileSystemEntry object in the second parameter or a FileSystemError
     * string describing a stat error.
     *
     * @param {string} path
     * @param {function(?string, Array.<FileSystemEntry>=, Array.<string|FileSystemStats>=)} callback
     */
    function readdir(path: string, callback: Function) {
        appshell.fs.readdir(path, function (err: NodeJS.ErrnoException, contents: string[]) {
            if (err) {
                callback(_mapError(err));
                return;
            }

            let count = contents.length;
            if (!count) {
                callback(null, [], []);
                return;
            }

            const stats: any[] = [];
            contents.forEach(function (val, idx) {
                stat(path + "/" + val, function (err2: NodeJS.ErrnoException, stat: any) {
                    stats[idx] = err2 || stat;
                    count--;
                    if (count <= 0) {
                        callback(null, contents, stats);
                    }
                });
            });
        });
    }

    /**
     * Create a directory at the given path, and call back asynchronously with
     * either a FileSystemError string or a stats object for the newly created
     * directory. The octal mode parameter is optional; if unspecified, the mode
     * of the created directory is implementation dependent.
     *
     * @param {string} path
     * @param {number=} mode The base-eight mode of the newly created directory.
     * @param {function(?string, FileSystemStats=)=} callback
     */
    function mkdir(path: string, mode: number, callback: Function) {
        if (typeof mode === "function") {
            callback = mode;
            mode = parseInt("0755", 8);
        }
        appshell.fs.mkdir(path, mode, function (err: NodeJS.ErrnoException) {
            if (err) {
                callback(_mapError(err));
            } else {
                stat(path, function (err2: NodeJS.ErrnoException, stat: any) {
                    callback(err2, stat);
                });
            }
        });
    }

    /**
     * Rename the file or directory at oldPath to newPath, and call back
     * asynchronously with a possibly null FileSystemError string.
     *
     * @param {string} oldPath
     * @param {string} newPath
     * @param {function(?string)=} callback
     */
    function rename(oldPath: string, newPath: string, callback: Function) {
        appshell.fs.rename(oldPath, newPath, _wrap(callback));
    }

    /**
     * Read the contents of the file at the given path, calling back
     * asynchronously with either a FileSystemError string, or with the data and
     * the FileSystemStats object associated with the read file. The options
     * parameter can be used to specify an encoding (default "utf8"), and also
     * a cached stats object that the implementation is free to use in order
     * to avoid an additional stat call.
     *
     * Note: if either the read or the stat call fails then neither the read data
     * nor stat will be passed back, and the call should be considered to have failed.
     * If both calls fail, the error from the read call is passed back.
     *
     * @param {string} path
     * @param {{encoding: string=, stat: FileSystemStats=}} options
     * @param {function(?string, string=, FileSystemStats=)} callback
     */
    function readFile(path: string, options: { encoding: string, stat: any }, callback: Function) {
        const encoding = options.encoding || "utf8";

        // callback to be executed when the call to stat completes
        //  or immediately if a stat object was passed as an argument
        function doReadFile(stat: any) {
            if (stat.size > (FileUtils.MAX_FILE_SIZE)) {
                callback(FileSystemError.EXCEEDS_MAX_FILE_SIZE);
            } else {
                appshell.fs.readTextFile(path, encoding, function (_err: NodeJS.ErrnoException, _data: string) {
                    if (_err) {
                        callback(_mapError(_err));
                    } else {
                        callback(null, _data, stat);
                    }
                });
            }
        }

        if (options.stat) {
            doReadFile(options.stat);
        } else {
            exports.stat(path, function (_err: NodeJS.ErrnoException, _stat: any) {
                if (_err) {
                    callback(_err);
                } else {
                    doReadFile(_stat);
                }
            });
        }
    }
    /**
     * Write data to the file at the given path, calling back asynchronously with
     * either a FileSystemError string or the FileSystemStats object associated
     * with the written file and a boolean that indicates whether the file was
     * created by the write (true) or not (false). If no file exists at the
     * given path, a new file will be created. The options parameter can be used
     * to specify an encoding (default "utf8"), an octal mode (default
     * unspecified and implementation dependent), and a consistency hash, which
     * is used to the current state of the file before overwriting it. If a
     * consistency hash is provided but does not match the hash of the file on
     * disk, a FileSystemError.CONTENTS_MODIFIED error is passed to the callback.
     *
     * @param {string} path
     * @param {string} data
     * @param {{encoding : string=, mode : number=, expectedHash : object=, expectedContents : string=}} options
     * @param {function(?string, FileSystemStats=, boolean)} callback
     */
    function writeFile(
        path: string,
        data: string,
        options: { encoding: string, mode: number, expectedHash: string, expectedContents: string },
        callback: Function
    ) {
        const encoding = options.encoding || "utf8";

        function _finishWrite(created: boolean) {
            if (typeof data !== "string") {
                return callback(new Error(`Can't write file, data has to be of type string: ${path}`));
            }
            if (/\0/.test(data)) {
                return callback(new Error(`Can't write file, data contains null bytes: ${path}`));
            }
            // window is going to close, we need to use sync writes to avoid unfinished writes
            if (appshell.windowGoingAway) {
                try {
                    appshell.fs.writeFileSync(path, data, encoding);
                    return callback(null, statSync(path), created);
                } catch (err) {
                    return callback(_mapError(err));
                }
            } else {
                appshell.fs.writeFile(path, data, encoding, function (err: NodeJS.ErrnoException) {
                    if (err) {
                        callback(_mapError(err));
                    } else {
                        stat(path, function (err2: NodeJS.ErrnoException, stat: any) {
                            callback(err2, stat, created);
                        });
                    }
                });
            }
        }

        stat(path, function (err: NodeJS.ErrnoException, stats: any) {
            if (err) {
                switch (err) {
                    case FileSystemError.NOT_FOUND:
                        _finishWrite(true);
                        break;
                    default:
                        callback(err);
                }
                return;
            }

            if (options.hasOwnProperty("expectedHash") && options.expectedHash !== stats._hash) {
                console.error("Blind write attempted: ", path, stats._hash, options.expectedHash);

                if (options.hasOwnProperty("expectedContents")) {
                    appshell.fs.readTextFile(path, encoding, function (_err: NodeJS.ErrnoException, _data: string) {
                        if (_err || _data !== options.expectedContents) {
                            callback(FileSystemError.CONTENTS_MODIFIED);
                            return;
                        }

                        _finishWrite(false);
                    });
                    return;
                } else {
                    callback(FileSystemError.CONTENTS_MODIFIED);
                    return;
                }
            }

            _finishWrite(false);
        });
    }

    /**
     * Unlink (i.e., permanently delete) the file or directory at the given path,
     * calling back asynchronously with a possibly null FileSystemError string.
     * Directories will be unlinked even when non-empty.
     *
     * @param {string} path
     * @param {function(string)=} callback
     */
    function unlink(path: string, callback: Function) {
        appshell.fs.remove(path, function (err: NodeJS.ErrnoException) {
            callback(_mapError(err));
        });
    }

    /**
     * Move the file or directory at the given path to a system dependent trash
     * location, calling back asynchronously with a possibly null FileSystemError
     * string. Directories will be moved even when non-empty.
     *
     * @param {string} path
     * @param {function(string)=} callback
     */
    function moveToTrash(path: string, callback: Function) {
        appshell.fs.moveToTrash(path, function (err: NodeJS.ErrnoException) {
            callback(_mapError(err));
        });
    }

    /**
     * Initialize file watching for this filesystem, using the supplied
     * changeCallback to provide change notifications. The first parameter of
     * changeCallback specifies the changed path (either a file or a directory);
     * if this parameter is null, it indicates that the implementation cannot
     * specify a particular changed path, and so the callers should consider all
     * paths to have changed and to update their state accordingly. The second
     * parameter to changeCallback is an optional FileSystemStats object that
     * may be provided in case the changed path already exists and stats are
     * readily available. The offlineCallback will be called in case watchers
     * are no longer expected to function properly. All watched paths are
     * cleared when the offlineCallback is called.
     *
     * @param {function(?string, FileSystemStats=)} changeCallback
     * @param {function()=} offlineCallback
     */
    function initWatchers(changeCallback: Function, offlineCallback: Function) {
        _changeCallback = changeCallback;
        _offlineCallback = offlineCallback;
    }

    /**
     * Start providing change notifications for the file or directory at the
     * given path, calling back asynchronously with a possibly null FileSystemError
     * string when the initialization is complete. Notifications are provided
     * using the changeCallback function provided by the initWatchers method.
     * Note that change notifications are only provided recursively for directories
     * when the recursiveWatch property of this module is true.
     *
     * @param {string} path
     * @param {Array<string>} ignored
     * @param {function(?string)=} callback
     */
    function watchPath(
        path: string,
        ignored: string[],
        callback: Function
    ) {
        appshell.fs.isNetworkDrive(path, function (err: NodeJS.ErrnoException, isNetworkDrive: boolean) {
            if (err || isNetworkDrive) {
                if (isNetworkDrive) {
                    callback(FileSystemError.NETWORK_DRIVE_NOT_SUPPORTED);
                } else {
                    callback(FileSystemError.UNKNOWN);
                }
                return;
            }
            _nodeDomain.exec("watchPath", path, ignored)
                .then(callback, callback);
        });
    }
    /**
     * Stop providing change notifications for the file or directory at the
     * given path, calling back asynchronously with a possibly null FileSystemError
     * string when the operation is complete.
     * This function needs to mirror the signature of watchPath
     * because of FileSystem.prototype._watchOrUnwatchEntry implementation.
     *
     * @param {string} path
     * @param {Array<string>} ignored
     * @param {function(?string)=} callback
     */
    function unwatchPath(
        path: string,
        ignored: string[],
        callback: Function
    ) {
        _nodeDomain.exec("unwatchPath", path)
            .then(callback, callback);
    }

    /**
     * Stop providing change notifications for all previously watched files and
     * directories, optionally calling back asynchronously with a possibly null
     * FileSystemError string when the operation is complete.
     *
     * @param {function(?string)=} callback
     */
    function unwatchAll(callback: Function) {
        _nodeDomain.exec("unwatchAll")
            .then(callback, callback);
    }

    // Export public API
    exports.showOpenDialog  = showOpenDialog;
    exports.showSaveDialog  = showSaveDialog;
    exports.exists          = exists;
    exports.readdir         = readdir;
    exports.mkdir           = mkdir;
    exports.rename          = rename;
    exports.stat            = stat;
    exports.readFile        = readFile;
    exports.writeFile       = writeFile;
    exports.unlink          = unlink;
    exports.moveToTrash     = moveToTrash;
    exports.initWatchers    = initWatchers;
    exports.watchPath       = watchPath;
    exports.unwatchPath     = unwatchPath;
    exports.unwatchAll      = unwatchAll;

    /**
     * Indicates whether or not recursive watching notifications are supported
     * by the watchPath call.
     *
     * @type {boolean}
     */
    exports.recursiveWatch = true;

    /**
     * Indicates whether or not the filesystem should expect and normalize UNC
     * paths. If set, then //server/directory/ is a normalized path; otherwise the
     * filesystem will normalize it to /server/directory. Currently, UNC path
     * normalization only occurs on Windows.
     *
     * @type {boolean}
     */
    exports.normalizeUNCPaths = appshell.platform === "win";
// });
