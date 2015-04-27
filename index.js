'use strict';

var Event = require('./lib/Event');
var Database = require('./lib/Database');
var FDBOpenDBRequest = require('./lib/FDBOpenDBRequest');
var FDBDatabase = require('./lib/FDBDatabase');
var FDBVersionChangeEvent = require('./lib/FDBVersionChangeEvent');
var cmp = require('./lib/cmp');

var databases = {};

function fireOpenSuccessEvent(request, db) {
    request.result = db;
    var event = new Event();
    event.target = request;
    event.type = 'success';
    request.dispatchEvent(event);
}

// http://www.w3.org/TR/IndexedDB/#dfn-steps-for-opening-a-database
function openDatabase(name, version, request) {
    if (!databases.hasOwnProperty(name)) {
        databases[name] = new Database(name, version);
        var db = new FDBDatabase(databases[name]);
        request.result = db; // for versionchange

        try {
            request.transaction = db.transaction(db.objectStoreNames, 'versionchange');
            request.transaction.addEventListener('complete', function () {
                request.transaction = null;

                setImmediate(fireOpenSuccessEvent.bind(null, request, db));
            });
            request.transaction.addEventListener('error', function (e) {
// Ugly hack so it runs after all other tx stuff finishes. Need a real queue, or a more appropriate time to schedule
                setTimeout(function () {
                    request.error = new Error();
                    request.error.name = e.target.error.name;
                    var event = new Event('error', {
                        bubbles: true,
                        cancelable: false
                    });
                    event._eventPath = [];
                    request.dispatchEvent(event);
                }, 1);
            });

            var event = new FDBVersionChangeEvent();
            event.target = request;
            event.type = 'upgradeneeded';
            request.dispatchEvent(event);
        } catch (err) {
            if (request.transaction) {
                request.transaction._abort('AbortError');
            }
            throw err;
        }
    } else {
        fireOpenSuccessEvent(request, new FDBDatabase(databases[name]));
    }
}

var fakeIndexedDB = {};

fakeIndexedDB.cmp = cmp;

// http://www.w3.org/TR/IndexedDB/#widl-IDBFactory-open-IDBOpenDBRequest-DOMString-name-unsigned-long-long-version
fakeIndexedDB.open = function (name, version) {
    if (version === 0) {
        throw new TypeError();
    }

    var request = new FDBOpenDBRequest();
    request.source = null;

    setImmediate(function () {
        try {
            openDatabase(name, version, request);
        } catch (err) {
            request.error = new Error();
            request.error.name = err.name;

            var event = new Event('error', {
                bubbles: true,
                cancelable: false
            });
            event._eventPath = [];
            request.dispatchEvent(event);
        }
    });

    return request;
};

module.exports = fakeIndexedDB;