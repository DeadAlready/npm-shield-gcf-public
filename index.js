'use strict';

var request = require('request');
var zlib = require('zlib');
var Tar = require('tar');
var util = require('util');
var path = require('path');
var check = require('./check');
var lengthStream = require('length-stream');
var datastore = require('./datastore');
var shacalc = require('./shacalc');

var endRegex = /\.(js|ts|coffee)$/;
function isInteresting(file) {
    return endRegex.test(file);
}
var specRegex = /\.spec\.js$/;
function isTest(folder, file) {
    return file.indexOf(folder + '/test/') === 0 || file.indexOf(folder + '/spec/') === 0 || specRegex.test(file);
}

exports.analyse = function analyse(context, data) {
    var url = data.url;
    var vid = data.vid;
    var shasum = data.shasum;
    var start = Date.now();

    var result = {
        vid: vid,
        hasGYP: false,
        shasum: undefined,
        shasumMatch: undefined,
        gzipSize: 0,
        unpackedSize: 0,
        fileCount: 0,
        testFiles: {
            count: 0,
            scripts: 0,
            types: {},
            analysis: undefined
        },
        nonTestFiles: {
            count: 0,
            scripts: 0,
            types: {},
            analysis: undefined
        }
    };

    var called = false;
    function insertResult(err) {
        if(called) {
            return;
        }
        called = true;
        if(result.testFiles.count === 0) {
            result.testFiles = {
                count: 0
            };
        }
        if(result.nonTestFiles.count === 0) {
            result.nonTestFiles = {
                count: 0
            };
        }
        result.updatedAt = Date.now();
        result.analysisTime = Date.now() - start;
        if(err) {
            result._error = util.inspect(err);
        }
        datastore.update(result.vid, result, function (err) {
            if(err) {
                console.log('Failed', vid);
                context.failure(err);
                return;
            }
            context.success();
        });
    }

    datastore.getLock(vid, function (err) {
        if(err) {
            console.log(err);
            if(err === 'already done') {
                context.success();
            } else {
                context.failure();
            }
            return;
        }

        request(url)
            .on('error', insertResult)
            .pipe(shacalc(function (sha) {
                result.shasum = sha;
                result.shasumMatch = shasum === sha;
            }))
            .pipe(lengthStream(function (length) {
                result.gzipSize = length;
            }))
            .pipe(zlib.createGunzip())
            .on('error', insertResult)
            .pipe(lengthStream(function (length) {
                result.unpackedSize = length;
            }))
            .pipe(Tar.Parse())
            .on('entry', function (data) {
                if(called) {
                    return;
                }
                if(data.type !== 'File') {
                    return;
                }
                var folder = data.path.substr(0, data.path.indexOf('/'));
                var isThisTest = isTest(folder, data.path);

                var fileExt = path.extname(data.path);
                if(!fileExt) {
                    fileExt = path.basename(data.path);
                }
                var fileCount = isThisTest ? result.testFiles.types : result.nonTestFiles.types;
                if(!fileCount[fileExt]) {
                    fileCount[fileExt] = 0;
                }
                fileCount[fileExt]++;
                result.fileCount++;
                isThisTest ? result.testFiles.count++ : result.nonTestFiles.count++;
                if(data.path === (folder + '/binding.gyp')) {
                    result.hasGYP = true;
                }

                if(!isInteresting(fileExt)) {
                    return;
                }
                isThisTest ? result.testFiles.scripts++ : result.nonTestFiles.scripts++;

                var fileData = '';
                data.on('data', function (chunk) {
                    try {
                        fileData += chunk.toString('utf8');
                    } catch(e) {
                        console.log('fileData too big');
                    }
                });
                data.on('end', function () {
                    var analysis = check.checkFile(folder, data.path, fileData);
                    if(isThisTest) {
                        result.testFiles.analysis = result.testFiles.analysis ? check.join(result.testFiles.analysis, analysis) : analysis;
                    } else {
                        result.nonTestFiles.analysis = result.nonTestFiles.analysis ? check.join(result.nonTestFiles.analysis, analysis) : analysis;
                    }
                    fileData = null; // Force delete just in case
                    data = null;
                });
            })
            .on('end', function () {
                insertResult();
            })
            .on('error', insertResult);
    });
};