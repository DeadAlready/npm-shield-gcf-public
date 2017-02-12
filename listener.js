'use strict';

let path = require('path');
let gcloud = require('gcloud');
let pubsub = gcloud.pubsub({
    projectId: 'npm-shield',
    keyFilename: path.join(__dirname, 'keys', 'npmshield.json')
});
const topicName = 'incoming-package';
const subscriptionName = 'analyser-' + Math.random().toString(36).substr(2);

let analyser = require('./index');

function subscribe(topicName, subscriptionName) {
    let options = {
        reuseExisting: true
    };
    return new Promise((resolve, reject) => {
        pubsub.subscribe(
            topicName,
            subscriptionName,
            options,
            function (err, subscription, apiResponse) {
                if (err) {
                    return reject(err);
                }

                // Got the subscription
                console.log('Subscribed to ' + topicName);
                resolve(subscription);
            }
        );
    });
}

function pullMessages(subscription) {
    var options = {
        // Limit the amount of messages pulled.
        maxResults: 10,
        // If set, the system will respond immediately. Otherwise, wait until
        // new messages are available. Returns if timeout is reached.
        returnImmediately: false
    };
    return new Promise((resolve, reject) => {
        // Pull any messages on the subscription
        subscription.pull(options, (err, messages) => {
            if(err) {
                return reject(err);
            }
            resolve(messages);
        });
    }).then(messages => {
        if(messages.length < 1) {
            return [];
        }

        return new Promise((resolve, reject) => {
            subscription.ack(messages.map(message => message.ackId), function (err) {
                if (err) {
                    return reject(err);
                }
                resolve(messages);
            });
        });
    });
}

function allSettled(promises) {
    if(!promises || !promises.length) {
        return Promise.resolve([]);
    }
    if(!Array.isArray(promises)) {
        return Promise.reject('Not an array');
    }
    return new Promise(resolve => {
        let result = [];
        let count = promises.length;
        function testEnd() {
            if(--count === 0) {
                resolve(result);
            }
        }
        promises.forEach((promise, index) => {
            promise.then(res => {
                result[index] = {
                    status: 'satisfied',
                    value: res
                };
                testEnd();
            }).catch(err => {
                result[index] = {
                    status: 'rejected',
                    value: err
                };
                testEnd();
            });
        });
    });
}

function processMessage(data) {
    return new Promise((resolve, reject) => {
        analyser.analyse({success:resolve, failure: reject}, data);
    });
}

function processMessages(messages) {
    return allSettled(messages.map(message => processMessage(message.data)))
        .then(() => messages.map(message => message.data.vid));
}

let count = 0;
function processLoop(subscription) {
    pullMessages(subscription)
        .then(processMessages)
        .then(ids => {
            count += ids.length;
            console.log('processed', ids);
            console.log('total:', count);
            console.log('time:', (new Date()).toString());
            processLoop(subscription);
        })
        .catch(err => {
            console.log(err);
        });
}

subscribe(topicName, subscriptionName)
    .then(processLoop)
    .catch(err => {
        console.log(err);
    });