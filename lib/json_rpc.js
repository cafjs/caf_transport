/*!
 Copyright 2013 Hewlett-Packard Development Company, L.P.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * Functions to generate messages with JSON-RPC 2.0 format.
 *
 * CAF uses a subset of this spec and, for example, RPC arguments are
 * never passed by name, using instead an array.
 *
 * CAF always adds an implicit first argument to
 * requests/notifications containing meta-data, for instance:
 *
 *        {
 *           "token": string, // security token for authentication
 *           "sessionId": string,// logical session name
 *           "to": string, // target CA
 *           "from": string // source CA
 *        }
 *
 * We also add the same meta-data to replies but in this case the json-rpc reply
 * message format complicates things:
 *
 *  - *Application-level errors* use a similar approach to node.js
 * callbacks. We use an array with 3 arguments [meta, error, data] with the
 * second one using a falsy if everything went fine. This means that
 * we *NEVER* use the JSON-RPC error response object for propagating
 * application errors.
 *
 *  - *System-level errors* (e.g., non-parsable JSON or missing target
 * CA) do use the error response object using exports.ERROR_CODES. In that
 * case we use a tuple (i.e., array) in the data field to add the meta-data,
 * i.e., { "error": {"data": [meta, extraData]}}.
 *
 * Use provided getters and setters to hide this complexity.
 *
 *
 * @module json_rpc
 */
'use strict';

var NAME_SEPARATOR = exports.NAME_SEPARATOR = '-';

exports.APP_SEPARATOR = '#';

/** Enum with error codes. */
var ERROR_CODES = exports.ERROR_CODES = {
    parseError: -32700,
    invalidRequest: -32600,
    methodNotFound: -32601,
    invalidParams: -32602,
    internalError: -32603,
    //-32000 to -32099 for implementation-defined server-errors
    noSuchCA: -32000,
    shutdownCA: -32001,
    checkpointFailure: -32002,
    prepareFailure: -32003,
    exceptionThrown: -32004,
    commitFailure: -32005,
    forceRedirect: -32006,
    notAuthorized: -32007,
    beginFailure: -32008,
    notAuthenticated: -32009
};


/** Default ID in requests that come from entities that have no proper id */
var DEFAULT_FROM_ID = exports.DEFAULT_FROM_ID = 'UNKNOWN';
/** Default username when user is unknown.*/
var DEFAULT_FROM_USERNAME = exports.DEFAULT_FROM_USERNAME =
        exports.NOBODY = 'NOBODY';
/** Default source of an external request. */
var DEFAULT_FROM = exports.DEFAULT_FROM = DEFAULT_FROM_USERNAME + '-' +
        DEFAULT_FROM_ID;
/** Default external session.*/
var DEFAULT_SESSION = exports.DEFAULT_SESSION = 'default';

/** Default id for a response to an invalid request with no id.*/
var DEFAULT_REQUEST_ID = exports.DEFAULT_REQUEST_ID = 42;

/** Default token with no authentication. */
var DUMMY_TOKEN = exports.DUMMY_TOKEN = 'INVALID';

/** Session id for internal sessions. We use the DEFAULT_SESSION.*/
var SYSTEM_SESSION_ID = exports.SYSTEM_SESSION_ID = DEFAULT_SESSION;
/** Reserved from id for internal, local sessions.*/
var SYSTEM_FROM_ID = exports.SYSTEM_FROM_ID = 'sys1';
/** Reserved username for internal, local sessions.*/
var SYSTEM_USERNAME = exports.SYSTEM_USERNAME = '!SYSTEM';
/** Reserved username_fromid for internal, local sessions.*/
var SYSTEM_FROM = exports.SYSTEM_FROM =
        SYSTEM_USERNAME + '-' + SYSTEM_FROM_ID;

/** Reserved token  for internal, local sessions.*/
var SYSTEM_TOKEN = exports.SYSTEM_TOKEN = DUMMY_TOKEN;

/** Generate a random string.
 *
 * @return {string}
 * @function
 */
var randomId = exports.randomId = function() {
    var unique = Math.floor(Math.random() * 10000000000000000);
    var result = '' + (new Date()).getTime() + unique;
    return result;
};

/** Tests if it is a notification message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
var isNotification = exports.isNotification = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.method) &&
            (msg.params && msg.params.length > 0) &&
            (!msg.id));
};

/** Creates notification message.
 *
 * @param {string} to
 * @param {string} from
 * @param {string} sessionId
 * @param {string} methodName
 * @param {any...} var_args
 * @return {caf.msg}
 *
 * @function
 */
var notification = exports.notification = function(to, from, sessionId,
                                                    methodName /*, var_args*/) {
    var argsArray = Array.prototype.slice.call(arguments);
    argsArray.splice(0, 4);
    var firstArg = {'sessionId': sessionId, 'to': to, 'from': from};
    argsArray.unshift(firstArg);
    return {
        'jsonrpc': '2.0',
        'method': methodName,
        'params': argsArray
    };
};

/** Tests if it is a request message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
var isRequest = exports.isRequest = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.method) &&
            (msg.params && msg.params.length > 0) &&
            (msg.id));
};

/** Creates a request message.
 *
 * @param {string} token
 * @param {string} to
 * @param {string} from
 * @param {string} sessionId
 * @param {string} methodName
 * @param {any...} var_args
 * @return {caf.msg}
 *
 * @function
 */
var request = exports.request = function(token /*, to, from, sessionId,
                                          methodName, var_args*/) {
    var argsArray = Array.prototype.slice.call(arguments);
    argsArray.shift(); // get rid of token
    var result = notification.apply(notification, argsArray);
    result.id = randomId();
    setToken(result, token);
    return result;
};


/** Creates a system request message.
 *
 * @param {string} to
 * @param {string} methodName
 * @param {any...} var_args
 * @return {caf.msg}
 *
 * @function
 */
exports.systemRequest = function(to, methodName/*, var_args*/) {
    var argsArray = Array.prototype.slice.call(arguments);
    var varArgsArray = argsArray.slice(2);
    var args = [SYSTEM_TOKEN, to, SYSTEM_FROM,
                SYSTEM_SESSION_ID, methodName]
            .concat(varArgsArray);
    return request.apply(request, args);
};

/** Tests if it is an application reply message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
var isAppReply = exports.isAppReply = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.result && (msg.result.length === 3)) &&
            (msg.id));
};

var newReplyMeta = function(request) {
    var result;
    try {
        result = {
            'token': getToken(request),
            'sessionId': getSessionId(request),
            'to': getFrom(request),
            'from': getTo(request)
        };
    } catch (err) {
        // bad request message did not have meta section
        result = {
            'token': DUMMY_TOKEN,
            'sessionId': DEFAULT_SESSION,
            'to': DEFAULT_FROM,
            'from': SYSTEM_FROM
        };
    }
    return result;
};

/**
 * Creates an application reply message.
 *
 * @param {caf.msg} request
 * @param {caf.json=} error
 * @param {caf.json} value
 * @return {caf.msg}
 *
 * @function
 *
 */
var appReply = function(request, error, value) {
    error = toErrorObject(error);
    if (error && (typeof error === 'object')) {
        error.request = request;
    }
    return {
        'jsonrpc': '2.0',
        'result': [newReplyMeta(request), error, value],
        'id': request.id
    };
};

/** Tests if it is a system error message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
var isSystemError = exports.isSystemError = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.error && msg.error.code) &&
            (msg.error.data) && (msg.error.data.length === 2) &&
            (msg.id));
};


var toErrorObject = function(err) {
    if (!err || (typeof err !== 'object')) {
        return err;
    } else {
        var obj = {};
        Object.getOwnPropertyNames(err) // include stack
            .forEach(function(key) {
                obj[key] = err[key];
            });
        return obj;
    }
};

/** Creates a system error message.
 *
 * @param {caf.msg} request
 * @param {number} code
 * @param {string} errMsg
 * @param {Error=} err Optional source error.
 * @return {caf.msg}
 *
 * @function
 */
var systemError = function(request, code, errMsg,
                           err) {
    err = err || new Error(errMsg);
    err = toErrorObject(err);
    if (typeof err === 'object') {
        err.request = request;
    }
    var error = {
        'code': code,
        'message': errMsg,
        'data': [newReplyMeta(request), err]
    };
    return {
        'jsonrpc': '2.0',
        'error': error,
        'id': request.id || DEFAULT_REQUEST_ID
    };
};

/**
 * Wraps an Error object of type SystemError:
 *
 * {name: 'SystemError', msg: caf_msg, code: number, errorStr: string,
 *  error: Error}
 *
 * @return {caf.error}
 *
 */
var newSysError = exports.newSysError = function(msg, code, errorStr,
                                                  errorOrg) {
    var error = new Error(errorStr);
    error.error = toErrorObject(errorOrg);
    error.name = 'SystemError';
    error.msg = msg;
    error.code = code;
    error.errorStr = errorStr;
    return error;
};

/**
 * Wraps an Error object of type AppError:
 *
 * {name: 'AppError', msg: caf_msg,  errorStr: string, error: Error}
 *
 *  @return {caf.error}
 */
var newAppError = exports.newAppError = function(msg, errorStr, errorOrg) {
    var error = new Error(errorStr);
    error.error = toErrorObject(errorOrg);
    error.name = 'AppError';
    error.msg = msg;
    error.errorStr = errorStr;
    return error;
};

/** Checks if it there is a recoverable error in message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
exports.isErrorRecoverable = function(msg) {
    var code = getSystemErrorCode(msg);
    // Non-deterministic errors or specific to a particular node
    return ((code === ERROR_CODES.noSuchCA) ||
            (code === ERROR_CODES.shutdownCA) ||
            (code === ERROR_CODES.checkpointFailure) ||
            (code === ERROR_CODES.prepareFailure) ||
            (code === ERROR_CODES.commitFailure) ||
            (code === ERROR_CODES.beginFailure) ||
            (code === ERROR_CODES.internalError));

};

/**
 * Creates an error replay message
 *
 * @param {caf.err} error
 *
 * @throws {Error} Not a  SystemError or AppError.
 *
 */
var errorReply = function(error) {
    if (error.name === 'SystemError') {
        return systemError(error.msg, error.code,
                           error.errorStr, error.error);
    } else if (error.name === 'AppError') {
        return appReply(error.msg, error.error, null);
    } else {
        var newErr = new Error('errorReply: not  App or System ' +
                               JSON.stringify(error));
        newErr.err = error;
        throw newErr;
    }
};

/** Creates a reply message.
 *
 * @param {caf.err} error
 * @param {caf.msg} request
 * @param {caf.json} value
 * @return {cd caf.msg}
 *
 * @function
 */
var reply = exports.reply = function(error, request, value) {
    if (error) {
        return errorReply(error);
    } else {
        return appReply(request, error, value);
    }
};

/** Creates a redirect message.
 *
 * @param {caf.msg} request
 * @param {string} errMsg
 * @param {Error} errOrg
 * @return {caf.msg}
 *
 * @function
 */
exports.redirect = function(request, errMsg, errOrg) {
    var error = newSysError(request, ERROR_CODES.forceRedirect, errMsg, errOrg);
    return reply(error);
};

/** Tests if it is a redirect message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
var isRedirect = exports.isRedirect = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.forceRedirect));
};

/**
 * Extracts the destination address of a redirection message.
 *
 * @param {caf.msg} msg A redirection message.
 * @return {string| null} A redirection address or null if not a valid
 * redirection message.
 *
 * @function
 */
exports.redirectDestination = function(msg) {
    var result = null;
    if (isRedirect(msg) && getSystemErrorData(msg)) {
        result = getSystemErrorData(msg).remoteNode;
    }
    return result;
};

/** Checks if it is a "not authorized" message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
exports.isNotAuthorized = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.notAuthorized));
};

/** Checks if it is a "principal not authenticated" message.
 *
 * @param {caf.msg} msg
 * @return {boolean}
 *
 * @function
 */
var isNotAuthenticated = exports.isNotAuthenticated = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.notAuthenticated));
};

/**
 * Extracts the URL of a service for user authenticaton
 * from a `notAuthenticated` error message.
 *
 * @param {caf.msg} msg A `notAuthenticated` error message.
 * @return {string| null} A url for an authentication service or  null if
 *  not a valid redirection message.
 *
 * @function
 */
exports.accountsURL = function(msg) {
    var result = null;
    if (isNotAuthenticated(msg) && getSystemErrorData(msg)) {
        result = getSystemErrorData(msg).accountsURL;
    }
    return result;
};


/** Executes an asynchronous method in a target CA  using arguments in an
 *  RPC request message.
 *
 * @param {caf.msg} msg
 * @param {Object} target
 * @param {caf.cb} cb Returns first argument optional error of type
 * caf.error (System or App error)  or, in the second argument,
 * the result of the method invocation.
 *
 * @function
 */
exports.call = function(msg, target, cb) {
    var error;
    if (typeof target !== 'object') {
        error = newSysError(msg, ERROR_CODES.noSuchCA,
                            'CA not found');
    }
    if ((!error) && !(isRequest(msg) || isNotification(msg))) {
        error = newSysError(msg, ERROR_CODES.invalidRequest,
                            'Invalid request');
    }
    if ((!error) && (typeof target[msg.method] !== 'function')) {
        error = newSysError(msg, ERROR_CODES.methodNotFound,
                            'method not found');
    }
    if (!error) {
        try {
            var args = msg.params.slice(1); // get rid of meta-data
            var cb1 = function(err, data) {
                if (err) {
                    err = newAppError(msg, 'AppError', err);
                }
                cb(err, data);
            };
            args.push(cb1);
            target[msg.method].apply(target, args);
        } catch (x) {
            error = newSysError(msg, ERROR_CODES.exceptionThrown,
                                'Exception in application code', x);
            cb(error);
        }
    } else {
        cb(error);
    }
};

/** Gets original method arguments from message.
 *
 * @param {caf.msg} msg
 * @return {Array.<caf.json>}
 * @throws {Error}
 * @function
 */
exports.getMethodArgs = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.params && msg.params.slice(1);
    } else {
        var err = new Error('Invalid msg');
        err.msg = msg;
        throw err;
    }
};

/** Gets the method name from message.
 *
 * @param {caf.msg} msg
 * @return {string}
 * @throws {Error}
 * @function
 */
exports.getMethodName = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.method;
    } else {
        var err = new Error('Invalid msg');
        err.msg = msg;
        throw err;
    }
};

/** Freezes meta-data in message.
 *
 * @param {caf.msg} msg
 *
 *
 * @throws {Error} if msg is not a proper caf.msg type.
 * @function
 */
exports.metaFreeze = function(msg) {
    Object.freeze(msg);
    if (isNotification(msg) || isRequest(msg)) {
        Object.freeze(msg.params);
        Object.freeze(msg.params[0]);
    } else if (isAppReply(msg)) {
        Object.freeze(msg.result);
        Object.freeze(msg.result[0]);
    } else if (isSystemError(msg)) {
        Object.freeze(msg.error);
        Object.freeze(msg.error.data);
        Object.freeze(msg.error.data[0]);
    } else {
        var err = new Error('Freezing  badly defined msg');
        err.msg = msg;
        throw err;
    }
};

/** Gets meta-data from message.
 *
 * @param {caf.msg} msg
 * @return {caf.meta}
 * @throws {Error}
 *
 * @function
 */
var getMeta = exports.getMeta = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.params[0];
    } else if (isAppReply(msg)) {
        return msg.result[0];
    } else if (isSystemError(msg)) {
        return msg.error.data[0];
    } else {
        var err = new Error('No meta in msg');
        err.msg = msg;
        throw err;
    }
};

/** Sets meta-data in message.
 *
 * @param {caf.msg} msg
 * @param {caf.meta} meta
 *
 * @throws {Error}
 *
 * @function
 */
var setMeta = exports.setMeta = function(msg, meta) {
    if (isRequest(msg) || isNotification(msg)) {
        msg.params[0] = meta;
    } else if (isAppReply(msg)) {
        msg.result[0] = meta;
    } else if (isSystemError(msg)) {
        msg.error.data[0] = meta;
    } else {
        var err = new Error('Setting metadata in a badly formatted msg.');
        err.msg = msg;
        throw err;
    }
};

/**
 * Patches meta-data in message.
 *
 * @param {caf.msg} msg
 * @param {Object} data Object to be merged-in.
 *
 * @throws {Error}
 *
 * @function
 */
exports.patchMeta = function(msg, data) {
    var meta = getMeta(msg) || {};
    data = data || {};
    Object.keys(data).forEach(function(x) { meta[x] = data[x];});
    setMeta(msg, meta);
};

/** Gets token from meta-data in message.
 *
 * @param {caf.msg} msg
 * @return {string | undefined}
 *
 * @function
 */
var getToken = exports.getToken = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.token : undefined);
};

/** Gets session id from meta-data in message.
 *
 * @param {caf.msg} msg
 * @return {string | undefined}
 *
 * @function
 */
var getSessionId = exports.getSessionId = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.sessionId : undefined);
};

/** Gets target CA  from meta-data in message.
 *
 * @param {caf.msg} msg
 * @return {string | undefined}
 *
 * @function
 */
var getTo = exports.getTo = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.to : undefined);
};

/** Gets source CA  from meta-data in message.
 *
 * @param {caf.msg} msg
 * @return {string | undefined}
 *
 * @function
 */
var getFrom = exports.getFrom = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.from : undefined);
};


/** Gets error field from application reply message.
 *
 * @param {caf.msg} msg
 * @return {caf.err | undefined}
 *
 * @function
 */
exports.getAppReplyError = function(msg) {
    return (isAppReply(msg) ? msg.result[1] : undefined);
};

/** Gets data field from application reply message.
 *
 * @param {caf.msg} msg
 * @return {caf.json | undefined}
 *
 * @function
 */
exports.getAppReplyData = function(msg) {
    return (isAppReply(msg) ? msg.result[2] : undefined);
};

/** Gets system error data from message.
 *
 * @param {caf.msg} msg
 * @return {caf.json | undefined}
 *
 * @function
 */
var getSystemErrorData = exports.getSystemErrorData = function(msg) {
    return (isSystemError(msg) ? msg.error.data[1] : undefined);
};

/** Gets system error code from message.
 *
 * @param {caf.msg} msg
 * @return {number | undefined}
 *
 * @function
 */
var getSystemErrorCode = exports.getSystemErrorCode = function(msg) {
    return (isSystemError(msg) ? msg.error.code : undefined);
};

/** Gets system error msg from message.
 *
 * @param {caf.msg} msg
 * @return {string | undefined}
 *
 * @function
 */
exports.getSystemErrorMsg = function(msg) {
    return (isSystemError(msg) ? msg.error.message : undefined);
};

/** Sets source CA in message meta-data.
 *
 * @param {caf.msg} msg
 * @param {string} from
 *
 * @function
 */
exports.setFrom = function(msg, from) {
    var meta = getMeta(msg) || {};
    meta.from = from;
    setMeta(msg, meta);
};

/** Sets target CA in message meta-data.
 *
 * @param {caf.msg} msg
 * @param {string} to
 *
 * @function
 */
exports.setTo = function(msg, to) {
    var meta = getMeta(msg) || {};
    meta.to = to;
    setMeta(msg, meta);
};

/** Sets session id in message meta-data.
 *
 * @param {caf.msg} msg
 * @param {string} sessionId
 *
 *
 * @function
 */
exports.setSessionId = function(msg, sessionId) {
    var meta = getMeta(msg) || {};
    meta.sessionId = sessionId;
    setMeta(msg, meta);
};

/** Sets token in message meta-data.
 *
 * @param {caf.msg} msg
 * @param {string} token
 *
 * @function
 */
var setToken = exports.setToken = function(msg, token) {
    var meta = getMeta(msg) || {};
    meta.token = token;
    setMeta(msg, meta);
};


/**
 * Splits a compound name into namespace root and local name.
 *  The convention is to use the character '-' to separate them.
 *
 * @param {string} name A name to split.
 * @param {string=} separator Optional separator to override '-'.
 * @return {Array.<string>} An array with two elements: namespace root and
 * local name, or three if it also has a map name, or four if fully
 * qualified CA name ,i.e., appPublisher-appLocalName-caOwner-caLocalName.
 *
 * @throws {Error} Invalid compound name.
 * @name  json_rpc/splitName
 * @function
 *
 */
exports.splitName = function(name, separator) {
    separator = separator || NAME_SEPARATOR;
    var result = name.split(separator);
    if ((result.length >= 2) && (result.length <= 4)) {
        return result;
    } else {
        var err = new Error('Invalid name');
        err.name = name;
        throw err;
    }
};

/**
 * Joins partial names using the standard separator
 *
 * @param {string} arguments A var number of strings.
 * @return {string} A joined name with the standard separator.
 */
exports.joinName = function() {
    var args = Array.prototype.slice.call(arguments);
    return args.join(NAME_SEPARATOR);
};

/**
 * Joins partial names using a separator
 *
 * @param {Array.<string>} args A var number of strings in an array.
 * @param {string=} separator Optional separator to override '-'.
 * @return {string} A joined name with the standard separator.
 */
exports.joinNameArray = function(args, separator) {
    separator = separator || NAME_SEPARATOR;
    return args.join(separator);
};
