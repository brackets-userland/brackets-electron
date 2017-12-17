import * as lodash from "lodash";
import UpdateFeedInfo from "../types/UpdateFeedInfo";

// define(function (require, exports, module) {

    const _: typeof lodash = node.require("lodash");
    const getLogger = node.require("./utils").getLogger;
    const log = getLogger("UpdateNotification");

    import Dialogs              = require("widgets/Dialogs");
    import DefaultDialogs       = require("widgets/DefaultDialogs");
    import ExtensionManager     = require("extensibility/ExtensionManager");
    import PreferencesManager   = require("preferences/PreferencesManager");
    import NativeApp            = require("utils/NativeApp");
    import Strings              = require("strings");
    import UpdateDialogTemplate = require("text!htmlContent/update-dialog.html");
    import UpdateListTemplate   = require("text!htmlContent/update-list.html");
    import Mustache             = require("thirdparty/mustache/mustache");

    // make sure the global brackets variable is loaded
    import "utils/Global";

    // duration of one day in milliseconds
    const ONE_DAY = 1000 * 60 * 60 * 24;

    // duration of two minutes in milliseconds
    const TWO_MINUTES = 1000 * 60 * 2;

    // Extract current build number from package.json version field 0.0.0
    // major and minor should match Brackets, last number is build version
    let _buildNumber = Number(brackets.metadata.version.match(/[0-9]+$/)[0]);

    // Init default last build number
    PreferencesManager.stateManager.definePreference("lastNotifiedBuildNumber", "number", 0);

    // Init default last info URL fetch time
    PreferencesManager.stateManager.definePreference("lastInfoURLFetchTime", "number", 0);

    // Time of last registry check for update
    PreferencesManager.stateManager.definePreference("lastExtensionRegistryCheckTime", "number", 0);
    // Data about available updates in the registry
    PreferencesManager.stateManager.definePreference("extensionUpdateInfo", "Array", []);

    // URL to load version info from. By default this is loaded no more than once a day. If
    // you force an update check it is always loaded.

    // Information on all posted builds of Brackets. This is an Array, where each element is
    // an Object with the following fields:
    //
    //  {Number} buildNumber Number of the build
    //  {String} versionString String representation of the build number (ie "Release 0.40")
    //  {String} dateString Date of the build
    //  {String} releaseNotesURL URL of the release notes for this build
    //  {String} downloadURL URL to download this build
    //  {Array} newFeatures Array of new features in this build. Each entry has two fields:
    //      {String} name Name of the feature
    //      {String} description Description of the feature
    //
    // This array must be reverse sorted by buildNumber (newest build info first)

    /**
     * @private
     * Flag that indicates if we've added a click handler to the update notification icon.
     */
    let _addedClickHandler = false;

    function transformAtomFeed(obj: any): UpdateFeedInfo {
        const currentVersion = node.require("./package.json").version;
        const GH = `https://github.com/zaggino/brackets-electron`;

        let entries = _.get(obj, "feed.entry", []);
        if (!_.isArray(entries)) { entries = [ entries ] as any; }

        return entries.map((entry: any) => {
            const version = entry.title._;
            return {
                buildNumber: version,
                versionString: version,
                dateString: entry.updated,
                releaseNotesURL: GH + `/compare/v${currentVersion}...v${version}`,
                downloadURL: GH + "/releases",
                newFeatures: []
            };
        });
    }

    /**
     * Get a data structure that has information for all builds of Brackets.
     *
     * If force is true, the information is always fetched from _versionInfoURL.
     * If force is false, we try to use cached information. If more than
     * 24 hours have passed since the last fetch, or if cached data can't be found,
     * the data is fetched again.
     *
     * If new data is fetched and dontCache is false, the data is saved in preferences
     * for quick fetching later.
     * _versionInfoUrl is used for unit testing.
     */
    function _getUpdateInformation(
        force: boolean,
        dontCache: boolean,
        _versionInfoUrl?: string
    ): JQueryPromise<UpdateFeedInfo> {
        // Last time the versionInfoURL was fetched
        let lastInfoURLFetchTime = PreferencesManager.getViewState("lastInfoURLFetchTime");

        const result = $.Deferred();
        let fetchData = false;
        let data: UpdateFeedInfo;

        // If force is true, always fetch
        if (force) {
            fetchData = true;
        }

        // If we don't have data saved in prefs, fetch
        data = PreferencesManager.getViewState("updateInfo");
        if (!data) {
            fetchData = true;
        }

        // If more than 24 hours have passed since our last fetch, fetch again
        if ((new Date()).getTime() > lastInfoURLFetchTime + ONE_DAY) {
            fetchData = true;
        }

        if (fetchData) {

            const autoUpdater = electron.remote.require("./auto-updater");
            const parseXml = node.require("./xml-utils").parseXml;
            const UPDATE_SERVER_HOST = autoUpdater.UPDATE_SERVER_HOST;
            const url = `https://${UPDATE_SERVER_HOST}/feed/channel/all.atom`;

            $.ajax({
                url,
                cache: false
            }).done(async function (_response, _textStatus, jqXHR) {

                let jsData: any;
                try {
                    jsData = await parseXml(jqXHR.responseText);
                } catch (err) {
                    log.error(`Error parsing update feed xml: ${err}`);
                    return;
                }

                const updateInfo = transformAtomFeed(jsData);
                if (!dontCache) {
                    lastInfoURLFetchTime = (new Date()).getTime();
                    PreferencesManager.setViewState("lastInfoURLFetchTime", lastInfoURLFetchTime);
                    PreferencesManager.setViewState("updateInfo", updateInfo);
                }
                result.resolve(updateInfo);

            }).fail(function (jqXHR, status, error) {
                // When loading data for unit tests, the error handler is
                // called but the responseText is valid. Try to use it here,
                // but *don't* save the results in prefs.

                if (!jqXHR.responseText) {
                    // Text is NULL or empty string, reject().
                    result.reject();
                    return;
                }

                try {
                    data = JSON.parse(jqXHR.responseText);
                    result.resolve(data);
                } catch (e) {
                    result.reject();
                }
            });
        } else {
            result.resolve(data);
        }

        return result.promise() as JQueryPromise<UpdateFeedInfo>;
    }

    /**
     * Show a dialog that shows the update
     */
    function _showUpdateNotificationDialog(updates: UpdateFeedInfo): void {
        Dialogs.showModalDialogUsingTemplate(Mustache.render(UpdateDialogTemplate, Strings))
            .done(function (id: string) {
                if (id === Dialogs.DIALOG_BTN_DOWNLOAD) {
                    // The first entry in the updates array has the latest download link
                    NativeApp.openURLInDefaultBrowser(updates[0].downloadURL);
                }
            });

        // Populate the update data
        const $dlg        = $(".update-dialog.instance");
        const $updateList = $dlg.find(".update-info");

        // Make the update notification icon clickable again
        _addedClickHandler = false;

        (updates as any).Strings = Strings;
        $updateList.html(Mustache.render(UpdateListTemplate, updates));
    }

    /**
     * Calculate state of notification everytime registries are downloaded - no matter who triggered the download
     */
    function _onRegistryDownloaded() {
        const availableUpdates = ExtensionManager.getAvailableUpdates();
        PreferencesManager.setViewState("extensionUpdateInfo", availableUpdates);
        PreferencesManager.setViewState("lastExtensionRegistryCheckTime", (new Date()).getTime());
        $("#toolbar-extension-manager").toggleClass("updatesAvailable", availableUpdates.length > 0);
    }

    /**
     *  Every 24 hours downloads registry information to check for update, but only if the registry download
     *  wasn't triggered by another action (like opening extension manager)
     *  If there isn't 24 hours elapsed from the last download, use cached information from last download
     *  to determine state of the update notification.
     */
    function checkForExtensionsUpdate() {
        const lastExtensionRegistryCheckTime = PreferencesManager.getViewState("lastExtensionRegistryCheckTime");
        const timeOfNextCheck = lastExtensionRegistryCheckTime + ONE_DAY;
        const currentTime = (new Date()).getTime();

        // update icon according to previously saved information
        let availableUpdates = PreferencesManager.getViewState("extensionUpdateInfo");
        availableUpdates = ExtensionManager.cleanAvailableUpdates(availableUpdates);
        $("#toolbar-extension-manager").toggleClass("updatesAvailable", availableUpdates.length > 0);

        if (availableUpdates.length === 0) {
            // icon is gray, no updates available
            if (currentTime > timeOfNextCheck) {
                // downloadRegistry, will be resolved in _onRegistryDownloaded
                ExtensionManager.downloadRegistry().done(function () {
                    // schedule another check in 24 hours + 2 minutes
                    setTimeout(checkForExtensionsUpdate, ONE_DAY + TWO_MINUTES);
                });
            } else {
                // schedule the download of the registry in appropriate time
                setTimeout(checkForExtensionsUpdate, (timeOfNextCheck - currentTime) + TWO_MINUTES);
            }
        }
    }

    /**
     * Check for updates. If "force" is true, update notification dialogs are always displayed
     * (if an update is available). If "force" is false, the update notification is only
     * displayed for newly available updates.
     *
     * If an update is available, show the "update available" notification icon in the title bar.
     *
     * @param {boolean} force If true, always show the notification dialog.
     * @param {Object} _testValues This should only be used for testing purposes. See comments for details.
     * @return {$.Promise} jQuery Promise object that is resolved or rejected after the update check is complete.
     */
    function checkForUpdate(force: boolean = false, _testValues?: any) {
        // This is the last version we notified the user about. If checkForUpdate()
        // is called with "false", only show the update notification dialog if there
        // is an update newer than this one. This value is saved in preferences.
        let lastNotifiedBuildNumber = PreferencesManager.getViewState("lastNotifiedBuildNumber");

        // The second param, if non-null, is an Object containing value overrides. Values
        // in the object temporarily override the local values. This should *only* be used for testing.
        // If any overrides are set, permanent changes are not made (including showing
        // the update notification icon and saving prefs).
        let oldValues: any;
        let usingOverrides = false; // true if any of the values are overridden.
        const result = $.Deferred();
        let versionInfoUrl: string | undefined;

        if (_testValues) {
            oldValues = {};

            if (_testValues.hasOwnProperty("_buildNumber")) {
                oldValues._buildNumber = _buildNumber;
                _buildNumber = _testValues._buildNumber;
                usingOverrides = true;
            }

            if (_testValues.hasOwnProperty("lastNotifiedBuildNumber")) {
                oldValues.lastNotifiedBuildNumber = lastNotifiedBuildNumber;
                lastNotifiedBuildNumber = _testValues.lastNotifiedBuildNumber;
                usingOverrides = true;
            }

            if (_testValues.hasOwnProperty("_versionInfoURL")) {
                versionInfoUrl = _testValues._versionInfoURL;
                usingOverrides = true;
            }
        }

        _getUpdateInformation(force || usingOverrides, usingOverrides, versionInfoUrl)
            .done(function (allUpdates: UpdateFeedInfo = []) {

                const semver = node.require("semver");
                const currentVersion = node.require("./package.json").version;

                // Get all available updates
                const availableUpdates = allUpdates.filter((x) => semver.gt(x.versionString, currentVersion));

                // When running directly from GitHub source (as opposed to
                // an installed build), _buildNumber is 0. In this case, if the
                // test is not forced, don't show the update notification icon or
                // dialog.
                if (_buildNumber === 0 && !force) {
                    result.resolve();
                    return;
                }

                if (availableUpdates && availableUpdates.length > 0) {
                    // Always show the "update available" icon if any updates are available
                    const $updateNotification = $("#update-notification");

                    $updateNotification.css("display", "block");

                    $updateNotification.on("click", function () {
                        // Block the click until the Notification Dialog opens
                        if (!_addedClickHandler) {
                            _addedClickHandler = true;
                            checkForUpdate(true);
                        }
                    });

                    // Only show the update dialog if force = true, or if the user hasn't been
                    // alerted of this update
                    if (force || availableUpdates[0].buildNumber >  lastNotifiedBuildNumber) {
                        _showUpdateNotificationDialog(availableUpdates);

                        // Update prefs with the last notified build number
                        lastNotifiedBuildNumber = availableUpdates[0].buildNumber;
                        // Don't save prefs is we have overridden values
                        if (!usingOverrides) {
                            PreferencesManager.setViewState("lastNotifiedBuildNumber", lastNotifiedBuildNumber);
                        }
                    }
                } else if (force) {
                    // No updates are available. If force == true, let the user know.
                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_ERROR,
                        Strings.NO_UPDATE_TITLE,
                        Strings.NO_UPDATE_MESSAGE
                    );
                }

                if (oldValues) {
                    if (oldValues.hasOwnProperty("_buildNumber")) {
                        _buildNumber = oldValues._buildNumber;
                    }
                    if (oldValues.hasOwnProperty("lastNotifiedBuildNumber")) {
                        lastNotifiedBuildNumber = oldValues.lastNotifiedBuildNumber;
                    }
                }
                result.resolve();
            })
            .fail(function () {
                // Error fetching the update data. If this is a forced check, alert the user
                if (force) {
                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_ERROR,
                        Strings.ERROR_FETCHING_UPDATE_INFO_TITLE,
                        Strings.ERROR_FETCHING_UPDATE_INFO_MSG
                    );
                }
                result.reject();
            });

        return result.promise();
    }

    /**
     * Launches both check for Brackets update and check for installed extensions update
     */
    function launchAutomaticUpdate() {
        // launch immediately and then every 24 hours + 2 minutes
        checkForUpdate();
        checkForExtensionsUpdate();
        window.setInterval(checkForUpdate, ONE_DAY + TWO_MINUTES);
    }

    // Events listeners
    ExtensionManager.on("registryDownload", _onRegistryDownloaded);

    // Define public API
    exports.launchAutomaticUpdate = launchAutomaticUpdate;
    exports.checkForUpdate        = checkForUpdate;
// });
