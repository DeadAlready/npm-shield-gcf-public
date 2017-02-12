'use strict';

module.exports.checkFile = checkFile;
module.exports.join = join;

/**************/

var path = require('path');

function findRequires(folder, file, data) {
    var requireRegex = /(^|\s)require\s*(\.call|\.apply|\.bind)?\s?\(\s*([^]+?)\s*\)/g;
    var matchArray;
    var result = [];
    var counter = 0;
    while ((matchArray = requireRegex.exec(data)) !== null && ++counter < 1000) {
        result.push(matchArray[3]);
    }
    return interestingRequires(folder, file, result);
}

function interestingRequires(folder, file, requires) {
    return requires.filter(function (name) {
        // Template
        if(name.indexOf('`') === 0 && name.indexOf('${') !== -1){
            return true;
        }
        // variable
        if(!/^["'`]/.test(name)) {
            return true;
        }
        var reqName = name.substr(1, name.length - 2);
        if(/[^a-zA-Z0-9\-\/\._]/.test(reqName)) {
            return true;
        }
        if(reqName.indexOf('.') === 0) {
            return path.join(path.dirname(file), reqName).indexOf(folder) !== 0;
        }
        return true;
    });
}

function checkFile(folder, fileName, data) {
    var allRequires = findRequires(folder, fileName, data);
    return {
        requires: allRequires.filter(function (name) { return /^["'`]/.test(name);}).map(function (name) { return name.substr(1, name.length - 2); }),
        variableRequireCount: allRequires.filter(function (name) { return !/^["'`]/.test(name)}).length,
        functionCount: countFunctions(data),
        bufferCount: countBuffers(data),
        evalCount: countEvals(data),
        regexCount: countRegex(data),
        useStrictCount: useStrictCount(data),
        tokens: tokens(data)
    };
}

function join(result1, result2) {
    return {
        requires: union(result1.requires, result2.requires), 
        variableRequireCount: result1.variableRequireCount + result2.variableRequireCount,
        functionCount: result1.functionCount + result2.functionCount,
        bufferCount: result1.bufferCount + result2.bufferCount,
        evalCount: result1.evalCount + result2.evalCount,
        regexCount: result1.regexCount + result2.regexCount,
        useStrictCount: result1.useStrictCount + result2.useStrictCount,
        tokens: result1.tokens.concat(result2.tokens)
    }
}

function union(arr1, arr2) {
    var result = [];
    arr1.forEach(function (elem){
        if(result.indexOf(elem) === -1) {
            result.push(elem);
        }
    });
    arr2.forEach(function (elem){
        if(result.indexOf(elem) === -1) {
            result.push(elem);
        }
    });
    return result;
}

function countFunctions(data) {
    var regex = /(^|\s)new Function\s?\(/g;
    var result = 0;
    var counter = 0;
    while (regex.exec(data) !== null && ++counter < 1000) {
        result++;
    }
    return result;
}

function countBuffers(data) {
    var regex = /(^|\s)new Buffer\s*\(/g;
    var result = 0;
    var counter = 0;
    while (regex.exec(data) !== null && ++counter < 1000) {
        result++;
    }
    var regex2 = /(^|\s)Buffer\s*\.allocUnsafe/g;
    var counter2 = 0;
    while (regex2.exec(data) !== null && ++counter2 < 1000) {
        result++;
    }
    return result;
}

function countEvals(data) {
    var regex = /(^|\s)eval\s?\(/g;
    var result = 0;
    var counter = 0;
    while (regex.exec(data) !== null && ++counter < 1000) {
        result++;
    }
    return result;
}

function countRegex(data) {
    var regex = /(^|\s)RegExp(\s|\()/g;
    var result = 0;
    var counter = 0;
    while (regex.exec(data) !== null && ++counter < 1000) {
        result++;
    }

    return result;
}

function tokens(data) {
    var inObjs = /("|'|`|\s)(pw|pass|password|token|clientID|clientSecret|secret|Authorization)\1?\s*:\s*?(.{1,30}\|\|)?\s*?("|'|`)(.{1,30})\4/gi;
    var asVars = /(\.|\s)(pw|pass|password|token|clientID|clientSecret|secret|Authorization)\s*=\s*?(.{1,30}\|\|)?\s*?("|'|`)(.{1,30})\4/gi;

    var results1 = data.match(inObjs) || [];
    var results2 = data.match(asVars) || [];

    return results1.concat(results2);
}

function useStrictCount(data) {
    return /("|'|`)use strict\1/.test(data) ? 1 : 0;
}