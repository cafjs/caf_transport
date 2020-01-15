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
 * CAF always adds a first argument to
 * requests/notifications containing metadata:
 *
 *        {
 *           "token": string, // security token for authentication
 *           "sessionId": string,// logical session name
 *           "to": string, // target CA
 *           "from": string // source CA
 *        }
 *
 * We also add the same metadata to replies, but the `json-rpc` reply
 * message format complicates things:
 *
 *  - *Application-level errors:* Return an array with 3 elements
 * `[meta, error, data]` with the
 * `error` term using a falsy if everything went fine.
 * We **never** use the JSON-RPC error response object for propagating
 * application errors.
 *
 *  - *System-level errors:* Use the error response object with
 * `exports.ERROR_CODES`. In that
 * case we use an array in the data field to add the metadata,
 * i.e., `{ "error": {"data": [meta, extraData]}}`.
 *
 * It is recommended to use the getters and setters in this library
 * to hide this complexity.
 *
 *
 * @module caf_transport/json_rpc
 */
'use strict';

const NAME_SEPARATOR = exports.NAME_SEPARATOR = '-';

exports.APP_SEPARATOR = '#';

const ERROR_CODES =
/** Enum with error codes.
 * @type {Object.<string, number>}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias ERROR_CODES
 */
exports.ERROR_CODES = {
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
    notAuthenticated: -32009,
    quotaExceeded: -32010
};

const DEFAULT_QUOTA_ID = // eslint-disable-line no-unused-vars
/**
 * Default ID targeting a quota service.
 *
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DEFAULT_QUOTA_ID
 */
exports.DEFAULT_QUOTA_ID = 'me';

const DEFAULT_FROM_ID =
/**
 * Default ID in requests that come from entities that have no proper id.
 *
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DEFAULT_FROM_ID
 */
exports.DEFAULT_FROM_ID = 'UNKNOWN';

const DEFAULT_FROM_USERNAME =
/**
 * Default username when user is unknown.
 *
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DEFAULT_FROM_USERNAME
 */
exports.DEFAULT_FROM_USERNAME =
        exports.NOBODY = 'NOBODY';

const DEFAULT_FROM =
/**
 * Default source of an external request.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DEFAULT_FROM
 */
exports.DEFAULT_FROM = DEFAULT_FROM_USERNAME + '-' +
        DEFAULT_FROM_ID;

const DEFAULT_SESSION =
/**
 * Default external session.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DEFAULT_SESSION
 */
exports.DEFAULT_SESSION = 'default';

const DEFAULT_REQUEST_ID =
/**
 * Default id for a response to an invalid request with no id.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DEFAULT_REQUEST_ID
 */
exports.DEFAULT_REQUEST_ID = 42;

const DUMMY_TOKEN =
/**
 * Default token with no authentication.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias DUMMY_TOKEN
 */
exports.DUMMY_TOKEN = 'INVALID';

const SYSTEM_SESSION_ID =
/**
 * Session id for internal sessions. We use the DEFAULT_SESSION.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias SYSTEM_SESSION_ID
 */
exports.SYSTEM_SESSION_ID = DEFAULT_SESSION;

const SYSTEM_FROM_ID =
/**
 * Reserved from id for internal, local sessions.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias SYSTEM_FROM_ID
 */
exports.SYSTEM_FROM_ID = 'sys1';

const SYSTEM_USERNAME =
/**
 * Reserved username for internal, local sessions.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias SYSTEM_USERNAME
*/
exports.SYSTEM_USERNAME = '!SYSTEM';

const SYSTEM_FROM =
/**
 * Reserved username_fromid for internal, local sessions.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias SYSTEM_FROM
*/
exports.SYSTEM_FROM = SYSTEM_USERNAME + '-' + SYSTEM_FROM_ID;

const SYSTEM_TOKEN =
/**
 * Reserved token  for internal, local sessions.
 * @type string
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias SYSTEM_TOKEN
 */
exports.SYSTEM_TOKEN = DUMMY_TOKEN;

const randomId =
/** Generate a random string.
 *
 * @return {string}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias randomId
 */
exports.randomId = function() {
    const unique = Math.floor(Math.random() * 10000000000000000);
    const result = '' + (new Date()).getTime() + unique;
    return result;
};

const isNotification =
/** Tests if it is a notification message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a notification message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isNotification
 */
exports.isNotification = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.method) &&
            (msg.params && msg.params.length > 0) &&
            (!msg.id));
};

const notification =
/** Creates notification message.
 *
 * @param {string} to
 * @param {string} from
 * @param {string} sessionId
 * @param {string} methodName
 * @param {...any} var_args
 * @return {msgType}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias notification
 */
exports.notification = function(to, from, sessionId,
                                methodName /*, var_args*/) {
    const argsArray = Array.prototype.slice.call(arguments);
    argsArray.splice(0, 4);
    const firstArg = {'sessionId': sessionId, 'to': to, 'from': from};
    argsArray.unshift(firstArg);
    return {
        'jsonrpc': '2.0',
        'method': methodName,
        'params': argsArray
    };
};

const isRequest =
/** Tests if it is a request message.
 *
 * @param {msgType} msg A message
 * @return {boolean} True if it is a request message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isRequest
 */
exports.isRequest = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.method) &&
            (msg.params && msg.params.length > 0) &&
            (msg.id));
};

const request =
/** Creates a request message.
 *
 * @param {string} token
 * @param {string} to
 * @param {string} from
 * @param {string} sessionId
 * @param {string} methodName
 * @param {...any} var_args
 * @return {msgType}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias request
 */
exports.request = function(token /*, to, from, sessionId,
                                          methodName, var_args*/) {
    const argsArray = Array.prototype.slice.call(arguments);
    argsArray.shift(); // get rid of token
    const result = notification.apply(notification, argsArray);
    result.id = randomId();
    setToken(result, token);
    return result;
};

/* eslint-disable no-unused-vars */
/** Creates a system request message.
 *
 * @param {string} to
 * @param {string} methodName
 * @param {...any} var_args
 * @return {msgType}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias systemRequest
 */
exports.systemRequest = function(to, methodName, var_args) {
    /* eslint-enable no-unused-vars */
    const argsArray = Array.prototype.slice.call(arguments);
    const varArgsArray = argsArray.slice(2);
    const args = [SYSTEM_TOKEN, to, SYSTEM_FROM,
                  SYSTEM_SESSION_ID, methodName].concat(varArgsArray);
    return request.apply(request, args);
};

const isAppReply =
/** Tests if it is an application reply message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True  if it is an application reply message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isAppReply
 */
exports.isAppReply = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.result && (msg.result.length === 3)) &&
            (msg.id));
};

const newReplyMeta = function(request) {
    try {
        return {
            'token': getToken(request),
            'sessionId': getSessionId(request),
            'to': getFrom(request),
            'from': getTo(request)
        };
    } catch (err) {
        // bad request message did not have meta section
        return {
            'token': DUMMY_TOKEN,
            'sessionId': DEFAULT_SESSION,
            'to': DEFAULT_FROM,
            'from': SYSTEM_FROM
        };
    }
};

/*
 * Creates an application reply message.
 *
 * @param {msgType} request
 * @param {caf.json=} error
 * @param {caf.json} value
 * @return {msgType}
 *
 * @function
 *
 */
const appReply = function(request, error, value) {
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

const isSystemError =
/** Tests if it is a system error message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a system error message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isSystemError
 */
exports.isSystemError = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.error && msg.error.code) &&
            (msg.error.data) && (msg.error.data.length === 2) &&
            (msg.id));
};


const toErrorObject = function(err) {
    if (!err || (typeof err !== 'object')) {
        return err;
    } else {
        const obj = {};
        Object.getOwnPropertyNames(err) // include stack
            .forEach(function(key) {
                obj[key] = err[key];
            });
        return obj;
    }
};

/* Creates a system error message.
 *
 * @param {msgType} request
 * @param {number} code
 * @param {string} errMsg
 * @param {Error=} err Optional source error.
 * @return {msgType}
 *
 * @function
 */
const systemError = function(request, code, errMsg, err) {
    err = err || new Error(errMsg);
    err = toErrorObject(err);
    if (typeof err === 'object') {
        err.request = request;
    }
    const error = {
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

const newSysError =
/**
 * Wraps an Error object of type SystemError:
 *
 * {name: 'SystemError', msg: msgType, code: number, errorStr: string,
 *  error: Error}
 *
 * @return {caf.error}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias newSysError
 *
 */
exports.newSysError = function(msg, code, errorStr, errorOrg) {
    const error = new Error(errorStr);
    error['error'] = toErrorObject(errorOrg);
    error['name'] = 'SystemError';
    error['msg'] = msg;
    error['code'] = code;
    error['errorStr'] = errorStr;
    return error;
};

const newAppError =
/**
 * Wraps an Error object of type AppError:
 *
 * `{name: 'AppError', msg: msgType,  errorStr: string, error: Error}`
 *
 *  @return {caf.error}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias newAppError
 */
exports.newAppError = function(msg, errorStr, errorOrg) {
    const error = new Error(errorStr);
    error['error'] = toErrorObject(errorOrg);
    error['name'] = 'AppError';
    error['msg'] = msg;
    error['errorStr'] = errorStr;
    return error;
};

/** Checks if it there is a recoverable error in message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a recoverable error.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isErrorRecoverable
 */
exports.isErrorRecoverable = function(msg) {
    const code = getSystemErrorCode(msg);
    // Non-deterministic errors or specific to a particular node
    return ((code === ERROR_CODES.noSuchCA) ||
            (code === ERROR_CODES.shutdownCA) ||
            (code === ERROR_CODES.checkpointFailure) ||
            (code === ERROR_CODES.prepareFailure) ||
            (code === ERROR_CODES.commitFailure) ||
            (code === ERROR_CODES.beginFailure) ||
            (code === ERROR_CODES.internalError));

};

/*
 * Creates an error replay message
 *
 * @param {caf.err} error
 *
 * @throws {Error} Not a  SystemError or AppError.
 *
 */
const errorReply = function(error) {
    if (error.name === 'SystemError') {
        return systemError(error.msg, error.code,
                           error.errorStr, error.error);
    } else if (error.name === 'AppError') {
        return appReply(error.msg, error.error, null);
    } else {
        const newErr = new Error('errorReply: not  App or System ' +
                                 JSON.stringify(error));
        newErr['err'] = error;
        throw newErr;
    }
};

const reply =
/** Creates a reply message.
 *
 * @param {caf.err} error
 * @param {msgType} request
 * @param {caf.json} value
 * @return {msgType}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias reply
 */
exports.reply = function(error, request, value) {
    if (error) {
        return errorReply(error);
    } else {
        return appReply(request, error, value);
    }
};

/** Creates a redirect message.
 *
 * @param {msgType} request
 * @param {string} errMsg
 * @param {Error} errOrg
 * @return {msgType}
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias redirect
 */
exports.redirect = function(request, errMsg, errOrg) {
    const error = newSysError(request, ERROR_CODES.forceRedirect, errMsg,
                              errOrg);
    return reply(error);
};

const isRedirect =
/** Tests if it is a redirect message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a redirect message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isRedirect
 */
exports.isRedirect = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.forceRedirect));
};

/**
 * Extracts the destination address of a redirection message.
 *
 * @param {msgType} msg A redirection message.
 * @return {string| null} A redirection address or null if not a valid
 * redirection message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias redirectDestination
 */
exports.redirectDestination = function(msg) {
    let result = null;
    if (isRedirect(msg) && getSystemErrorData(msg)) {
        result = getSystemErrorData(msg).remoteNode;
    }
    return result;
};

/** Checks if it is a `not authorized` message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a `not authorized` message
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isNotAuthorized
 */
exports.isNotAuthorized = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.notAuthorized));
};

/** Checks if it is a `quota exceeded` message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a `quota exceeded` message
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isQuotaExceeded
 */
exports.isQuotaExceeded = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.quotaExceeded));
};


const isNotAuthenticated =
/** Checks if it is a "principal not authenticated" message.
 *
 * @param {msgType} msg A message.
 * @return {boolean} True if it is a `notAuthenticated` message
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias isNotAuthenticated
 */
exports.isNotAuthenticated = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.notAuthenticated));
};

/**
 * Extracts the URL of a service for user authenticaton
 * from a `notAuthenticated` error message.
 *
 * @param {msgType} msg A `notAuthenticated` error message.
 * @return {string| null} A url for an authentication service or  null if
 *  not a valid redirection message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias accountsURL
 */
exports.accountsURL = function(msg) {
    let result = null;
    if (isNotAuthenticated(msg) && getSystemErrorData(msg)) {
        result = getSystemErrorData(msg).accountsURL;
    }
    return result;
};


/** Executes an asynchronous method in a target CA  using arguments in an
 *  RPC request message.
 *
 * @param {msgType} msg A message.
 * @param {Object} target Target CA.
 * @param {cbType} cb Returns in first argument an optional error of type
 * `caf.error` (System or App error)  or, in the second argument,
 * the result of the method invocation.
 *
 * @return {Promise=} An optional promise to enable `async` methods.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias call
 */
exports.call = function(msg, target, cb) {
    let error = null;
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
            const args = msg.params.slice(1); // get rid of meta-data
            const cb1 = function(err, data) {
                if (err) {
                    err = newAppError(msg, 'AppError', err);
                }
                cb(err, data);
            };
            args.push(cb1);
            return target[msg.method].apply(target, args);
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
 * @param {msgType} msg A message
 * @return {Array.<jsonType>} An array with method arguments.
 * @throws {Error} when invalid message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getMethodArgs
 */
exports.getMethodArgs = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.params && msg.params.slice(1);
    } else {
        const err = new Error('Invalid msg');
        err['msg'] = msg;
        throw err;
    }
};

/** Gets the method name from message.
 *
 * @param {msgType} msg A message.
 * @return {string} The name of the method.
 * @throws {Error} when message is invalid.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getMethodName
 */
exports.getMethodName = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.method;
    } else {
        const err = new Error('Invalid msg');
        err['msg'] = msg;
        throw err;
    }
};

/** Freezes meta-data in message.
 *
 * @param {msgType} msg A message.
 *
 * @throws {Error} if msg is not a proper `msgType` type.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias metaFreeze
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
        const err = new Error('Freezing  badly defined msg');
        err['msg'] = msg;
        throw err;
    }
};

const getMeta =
/** Gets meta-data from message.
 *
 * @param {msgType} msg A message
 * @return {caf.meta} Metadata in the message.
 * @throws {Error} when message invalid.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getMeta
 */
exports.getMeta = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.params[0];
    } else if (isAppReply(msg)) {
        return msg.result[0];
    } else if (isSystemError(msg)) {
        return msg.error.data[0];
    } else {
        const err = new Error('No meta in msg');
        err['msg'] = msg;
        throw err;
    }
};

const setMeta =
/** Sets meta-data in message.
 *
 * @param {msgType} msg A message.
 * @param {caf.meta} meta Metadata to set.
 *
 * @throws {Error} When message invalid.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias setMeta
 */
exports.setMeta = function(msg, meta) {
    if (isRequest(msg) || isNotification(msg)) {
        msg.params[0] = meta;
    } else if (isAppReply(msg)) {
        msg.result[0] = meta;
    } else if (isSystemError(msg)) {
        msg.error.data[0] = meta;
    } else {
        const err = new Error('Setting metadata in a badly formatted msg.');
        err['msg'] = msg;
        throw err;
    }
};

/**
 * Patches meta-data in message.
 *
 * @param {msgType} msg A message.
 * @param {Object} data Metadata object to be merged-in.
 *
 * @throws {Error} when message invalid.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias patchMeta
 */
exports.patchMeta = function(msg, data) {
    const meta = getMeta(msg) || {};
    data = data || {};
    Object.keys(data).forEach(function(x) { meta[x] = data[x];});
    setMeta(msg, meta);
};

const getToken =
/** Gets token from meta-data in message.
 *
 * @param {msgType} msg A message.
 * @return {string | undefined} Token in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getToken
 */
exports.getToken = function(msg) {
    const meta = getMeta(msg);
    return (meta ? meta.token : undefined);
};

const getSessionId =
/** Gets session id from meta-data in message.
 *
 * @param {msgType} msg A message.
 * @return {string | undefined} Session id in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getSessionId
 */
exports.getSessionId = function(msg) {
    const meta = getMeta(msg);
    return (meta ? meta.sessionId : undefined);
};

const getTo =
/** Gets target CA  from meta-data in message.
 *
 * @param {msgType} msg A message.
 * @return {string | undefined}  Target CA in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getTo
 */
exports.getTo = function(msg) {
    const meta = getMeta(msg);
    return (meta ? meta.to : undefined);
};

const getFrom =
/** Gets source CA  from meta-data in message.
 *
 * @param {msgType} msg A message.
 * @return {string | undefined} From field in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getFrom
 */
exports.getFrom = function(msg) {
    const meta = getMeta(msg);
    return (meta ? meta.from : undefined);
};


/** Gets error field from application reply message.
 *
 * @param {msgType} msg A message.
 * @return {jsonType | undefined} Error in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getAppReplyError
 */
exports.getAppReplyError = function(msg) {
    return (isAppReply(msg) ? msg.result[1] : undefined);
};

/** Gets data field from application reply message.
 *
 * @param {msgType} msg A message.
 * @return {jsonType | undefined} Data in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getAppReplyData
 */
exports.getAppReplyData = function(msg) {
    return (isAppReply(msg) ? msg.result[2] : undefined);
};

const getSystemErrorData =
/** Gets system error data from message.
 *
 * @param {msgType} msg A message.
 * @return {caf.json | undefined} System error data in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getSystemErrorData
 */
exports.getSystemErrorData = function(msg) {
    return (isSystemError(msg) ? msg.error.data[1] : undefined);
};

const getSystemErrorCode =
/** Gets system error code from message.
 *
 * @param {msgType} msg A message.
 * @return {number | undefined} System error code in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getSystemErrorCode
 */
exports.getSystemErrorCode = function(msg) {
    return (isSystemError(msg) ? msg.error.code : undefined);
};

/** Gets system error msg from message.
 *
 * @param {msgType} msg A message.
 * @return {string | undefined} System error message in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias getSystemErrorMsg
 */
exports.getSystemErrorMsg = function(msg) {
    return (isSystemError(msg) ? msg.error.message : undefined);
};

/** Sets source CA in message meta-data.
 *
 * @param {msgType} msg A message.
 * @param {string} from `From` field to set.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias setFrom
 */
exports.setFrom = function(msg, from) {
    const meta = getMeta(msg) || {};
    meta.from = from;
    setMeta(msg, meta);
};

/** Sets target CA in message meta-data.
 *
 * @param {msgType} msg A message.
 * @param {string} to  `To` field to set.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias setTo
 */
exports.setTo = function(msg, to) {
    const meta = getMeta(msg) || {};
    meta.to = to;
    setMeta(msg, meta);
};

/** Sets session id in message meta-data.
 *
 * @param {msgType} msg A message.
 * @param {string} sessionId  Session id to set.
 *
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias setSessionId
 */
exports.setSessionId = function(msg, sessionId) {
    const meta = getMeta(msg) || {};
    meta.sessionId = sessionId;
    setMeta(msg, meta);
};

const setToken =
/** Sets token in message meta-data.
 *
 * @param {msgType} msg  A message.
 * @param {string} token Token to set in message.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias setToken
 */
exports.setToken = function(msg, token) {
    const meta = getMeta(msg) || {};
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
 * qualified CA name ,i.e., `appPublisher-appLocalName-caOwner-caLocalName`.
 *
 * @throws {Error} Invalid compound name.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias splitName
 *
 */
exports.splitName = function(name, separator) {
    separator = separator || NAME_SEPARATOR;
    const result = name.split(separator);
    if ((result.length >= 2) && (result.length <= 4)) {
        return result;
    } else {
        const err = new Error('Invalid name');
        err.name = name;
        throw err;
    }
};

/**
 * Joins partial names using the standard separator
 *
 * @param {...string} strings A var number of strings.
 * @return {string} A joined name with the standard separator.
 *
 * @memberof! module:caf_transport/json_rpc
 * @alias joinName
 */
exports.joinName = function(strings) { // eslint-disable-line no-unused-vars
    const args = Array.prototype.slice.call(arguments);
    return args.join(NAME_SEPARATOR);
};

/**
 * Joins partial names using a separator
 *
 * @param {Array.<string>} args A var number of strings in an array.
 * @param {string=} separator Optional separator to override '-'.
 * @return {string} A joined name with the standard separator.
 * @memberof! module:caf_transport/json_rpc
 * @alias joinNameArray
 */
exports.joinNameArray = function(args, separator) {
    separator = separator || NAME_SEPARATOR;
    return args.join(separator);
};
