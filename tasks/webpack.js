/* eslint-env node */

"use strict";

module.exports = function (grunt) {

    var _       = require("lodash"),
        common  = require("./lib/common")(grunt),
        build   = require("./build")(grunt),
        glob    = require("glob"),
        path    = require("path"),
        spawn   = require('cross-spawn');

    grunt.registerTask(
        "webpack-browser-dependencies",
        "Runs webpack on stuff we need to use from browser",
        function () {
            var done = this.async();
            var webpackPath = path.resolve(
                __dirname,
                "..",
                "node_modules",
                ".bin",
                process.platform === "win32" ? "webpack.cmd" : "webpack"
            );
            var webpackTasks = [
                [
                    `./dist/node_modules/semver/semver.js`,
                    `./dist/www/thirdparty/semver.browser.js`,
                    `-p`,
                    `--output-library-target=amd`
                ]
            ];
            var doneWithWebpackTask = _.after(webpackTasks.length, done);
            webpackTasks.forEach(args => {
                var wp = spawn(webpackPath, args, {
                    cwd: path.resolve(__dirname, "..")
                });
                wp.stdout.on('data', (data) => {
                    console.log(`webpack-stdout: ${data}`);
                });
                wp.stderr.on('data', (data) => {
                    console.log(`webpack-stderr: ${data}`);
                });
                wp.on('close', (code) => {
                    console.log(`webpack-exit code ${code}`);
                    return code === 0 ? doneWithWebpackTask() : done(false);
                });
            });
        });
};
