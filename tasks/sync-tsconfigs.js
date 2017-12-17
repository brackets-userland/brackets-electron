/* eslint-env node */

"use strict";

module.exports = function (grunt) {
    const common    = require("./lib/common")(grunt);
    const build     = require("./build")(grunt);
    const fs        = require("fs");
    const path      = require("path");
    const _         = require('lodash');

    // sync-tsconfigs
    grunt.registerTask("sync-tsconfigs", "Sync the root tsconfig.json into app and src folders", function () {

        const tsconfigJSON = grunt.file.readJSON("tsconfig.json");

        common.writeJSON(grunt, "app/tsconfig.json", _.defaultsDeep({
            compilerOptions: {
                outDir: `../dist`
            },
            include: ['./**/*']
        }, tsconfigJSON));

        common.writeJSON(grunt, "src/tsconfig.json", _.defaultsDeep({
            compilerOptions: {
                outDir: `../dist/www`,
                module: "amd",
                moduleResolution: "classic",
                noImplicitAny: false
            },
            include: [
                './**/*',
                '../node_modules/@types/**/*',
                '../node_modules/electron/electron.d.ts'
            ]
        }, tsconfigJSON));

    });

};
