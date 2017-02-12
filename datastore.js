'use strict';

module.exports.update = update;
module.exports.insert = insert;
module.exports.getLock = getLock;
// module.exports.read = read;

/**********************/
var path = require('path');
var gcloud = require('gcloud');
var ds = gcloud.datastore({
    projectId: 'npm-shield',
    keyFilename: path.join(__dirname, 'keys', 'npmshield.json')
});

var indexes = ['updatedAt'];

function toDatastore (obj) {
    return Object.keys(obj).reduce(function (results, k) {
        if (obj[k] === undefined) {
            return results;
        }
        results.push({
            name: k,
            value: obj[k],
            excludeFromIndexes: indexes.indexOf(k) === -1
        });
        return results;
    }, []);
}
var kind = 'package_code_analysis';
function update (id, data, cb) {
    var key;
    if (id) {
        key = ds.key([kind, id]);
    } else {
        key = ds.key(kind);
    }

    var entity = {
        key: key,
        data: toDatastore(data)
    };
    
    ds.save(
        entity,
        function (err) {
            data.id = entity.key.id;
            cb(err, data);
        }
    );
}

function insert(data, cb) {
    return update(null, data, cb);
}

function getLock(id, cb) {
    var error;

    var lockEntity = {
        key: ds.key([kind, id]),
        data: {
            _lock: true,
            startedAt: Date.now()
        }
    };

    ds.runInTransaction(function(transaction, done) {
        transaction.get(lockEntity.key, function(err, lock) {
            if (err) {
                // An error occurred while getting the values.
                error = err;
                transaction.rollback(done);
                return;
            }
            if(!lock) {
                transaction.save(lockEntity);
                done();
                return;
            }
            if(lock.updatedAt && !lock._error) {
                error = 'already done';
                transaction.rollback(done);
                return;
            }
            if(lock.startedAt > (lockEntity.startedAt - 60 * 60 * 1000)) {
                error = 'Exists';
                // The task entity already exists.
                transaction.rollback(done);
                return;
            }
            lock.data = lockEntity.data;
            transaction.save(lock);
            done();
        });
    }, function(transactionError) {
        if (transactionError || error) {
            cb(transactionError || error);
        } else {
            // The transaction completed successfully.
            cb(null, lockEntity);
        }
    });
}