'use strict';

module.exports = shacalc;

/**********************/

var crypto = require('crypto');
var passStream = require('pass-stream');

function shacalc (listener) {
    var hash = crypto.createHash('sha1');
    function writeFn(data, encoding, cb) {
        hash.update(data);
        this.push(data);
        cb();
    }
    function endFn(cb) {
        listener(hash.digest('hex')); // call with resultant length
        cb();
    }
    return passStream(writeFn, endFn, {});
}