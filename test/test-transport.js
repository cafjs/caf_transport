var json_rpc = require('../lib/json_rpc');



var TO = 'xx';
var OTHER_TO = 'other-xx';
var FROM = 'yy';
var OTHER_FROM = 'other-from';
var TOKEN = 'zz';
var OTHER_TOKEN = 'other-zz';
var SESSION_ID = 'vv';
var OTHER_SESSION_ID= 'other-vv';
var METHOD_NAME = 'doit';
var ARGS = ['hello', 'bye'];

module.exports = {

    request: function(test) {
        test.expect(38);
        var hello = {
            doit: function(hello, bye, cb) {
                test.equal(hello, ARGS[0], 'arg0 does not match');
                test.equal(bye, ARGS[1], 'arg1 does not match');
                cb(null, 'ok');
            },
            appError: function(hello, bye, cb) {
                cb(new Error('foo'));
            },
            crash: function(hello, bye, cb) {
                throw new Error("Messed up");
            }
        };
        var req = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, METHOD_NAME,
                                   ARGS[0], ARGS[1]);
        test.ok(json_rpc.isRequest(req));
        test.ok(!json_rpc.isNotification(req));

        json_rpc.call(req, hello, function(err, data) {
                          test.equal(data, 'ok');
                          test.ok(!err);
                      });

        test.equal(json_rpc.getToken(req), TOKEN);
        test.equal(json_rpc.getTo(req), TO);
        test.equal(json_rpc.getFrom(req), FROM);
        test.equal(json_rpc.getSessionId(req), SESSION_ID);

        var meta = json_rpc.getMeta(req);
        test.equal(meta.token, TOKEN);
        test.equal(meta.to, TO);
        test.equal(meta.from, FROM);
        test.equal(meta.sessionId, SESSION_ID);

        json_rpc.setToken(req, OTHER_TOKEN);
        json_rpc.setSessionId(req, OTHER_SESSION_ID);
        json_rpc.setFrom(req, OTHER_FROM);
        json_rpc.setTo(req, OTHER_TO);

        test.equal(json_rpc.getToken(req), OTHER_TOKEN);
        test.equal(json_rpc.getTo(req), OTHER_TO);
        test.equal(json_rpc.getFrom(req), OTHER_FROM);
        test.equal(json_rpc.getSessionId(req), OTHER_SESSION_ID);

        test.deepEqual(json_rpc.getMethodArgs(req), ARGS);

        json_rpc.metaFreeze(req);
        test.throws(function() {
                        json_rpc.setFrom(req, FROM);
                    });
        test.throws(function() {
                        json_rpc.setTo(req, TO);
                    });
        test.throws(function() {
                        json_rpc.setSessionId(req, SESSION_ID);
                    });
        test.throws(function() {
                        json_rpc.setToken(req, TOKEN);
                    });

        var reqAppError = json_rpc.request(TOKEN, TO, FROM, SESSION_ID,
                                           'appError',
                                           ARGS[0], ARGS[1]);

        json_rpc.call(reqAppError, hello, function(err, data) {
                          test.ok(!data);
                          test.equal(typeof err.stack, 'string');
                      });


        var reqCrash = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, 'crash',
                                        ARGS[0], ARGS[1]);
        json_rpc.call(reqCrash, hello, function(err) {
                          err = json_rpc.reply(err);
                          test.equal(json_rpc.getSystemErrorMsg(err),
                                     'Invalid params', 'not crashed');
                          test.equal(json_rpc.getSystemErrorCode(err),
                                     json_rpc.ERROR_CODES.invalidParams,
                                     'crashed: bad errn');
                          var errData = json_rpc.getSystemErrorData(err);
                          test.equal(typeof errData.stack, 'string',
                                     'crashed: bad stack');
                          test.ok(!json_rpc.isAppReply(err), 'system error ' +
                                  ' confused as app reply');
                          test.ok(json_rpc.isSystemError(err),
                                  ' not a system error');
                          test.equal(json_rpc.getMeta(err).token, TOKEN);
                          test.equal(json_rpc.getMeta(err).from, TO);
                          test.equal(json_rpc.getMeta(err).to, FROM);
                          test.equal(json_rpc.getMeta(err).sessionId,
                                     SESSION_ID);
                      });

        var reqNotThere = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, 'ccc',
                                           ARGS[0], ARGS[1]);
        json_rpc.call(reqNotThere, hello, function(err) {
                          err = json_rpc.reply(err);
                          test.equal(json_rpc.getSystemErrorMsg(err),
                                     'method not found', 'not there');
                          test.equal(json_rpc.getSystemErrorCode(err),
                                     json_rpc.ERROR_CODES.methodNotFound,
                                     'not there: bad errn');
                          test.ok(json_rpc.isSystemError(err),
                                  ' not a system error');
                          var errData = json_rpc.getSystemErrorData(err);
                          test.equal(typeof errData.stack, 'string',
                                     'crashed: bad stack');
                      });


        test.done();

    },
    reply: function(test) {
        test.expect(56);
        var req = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, METHOD_NAME,
                                   ARGS[0], ARGS[1]);
        var replyOK = json_rpc.reply(null, req, 'foo');
        var checkReply = function(reply, sysError) {
            if (sysError) {
                test.ok(!json_rpc.isAppReply(reply), 'not an app reply');
                test.ok(json_rpc.isSystemError(reply), 'system error');
            } else {
                test.ok(json_rpc.isAppReply(reply), 'not an app reply');
                test.ok(!json_rpc.isSystemError(reply), 'system error');
            }
            test.equal(json_rpc.getToken(reply), TOKEN);
            test.equal(json_rpc.getTo(reply), FROM);
            test.equal(json_rpc.getFrom(reply), TO);
            test.equal(json_rpc.getSessionId(reply), SESSION_ID);

            var meta = json_rpc.getMeta(reply);
            test.equal(meta.token, TOKEN);
            test.equal(meta.to, FROM);
            test.equal(meta.from, TO);
            test.equal(meta.sessionId, SESSION_ID);
        };
        test.equal(json_rpc.getAppReplyData(replyOK), 'foo', 'bad data reply');
        test.equal(json_rpc.getAppReplyError(replyOK), null, 'bad err reply');

        checkReply(replyOK);

        var replyBad = json_rpc
            .reply(json_rpc.newAppError(req, 'foo', new Error('foo')), req);
        checkReply(replyBad);
        test.equal(json_rpc.getAppReplyData(replyBad), null, 'bad data reply');
        test.equal(json_rpc.getAppReplyError(replyBad).message, 'foo',
                   'bad err reply');

        var sysError =   json_rpc
            .reply(json_rpc.newSysError(req,
                                        json_rpc.ERROR_CODES.parseError,
                                        'foo'));
        checkReply(sysError, true);
        test.equal(json_rpc.getSystemErrorCode(sysError),
                   json_rpc.ERROR_CODES.parseError);
        test.ok(!json_rpc.isRedirect(sysError));
        test.ok(!json_rpc.isNotAuthorized(sysError));
        test.ok(!json_rpc.isErrorRecoverable(sysError));
        test.equal(typeof json_rpc.getSystemErrorData(sysError).stack,
                   'string');
        // stack is different
        test.notDeepEqual(json_rpc
                          .reply(json_rpc.newSysError(req,
                                                      json_rpc.ERROR_CODES
                                                      .parseError,
                                                      'foo')), sysError);
        test.doesNotThrow(function() {
                              var p = JSON.stringify(sysError);
                              console.log(p);
                          });
        var redirError = json_rpc.redirect(req, 'foo');
        test.ok(json_rpc.isRedirect(redirError));
        test.ok(json_rpc.isSystemError(redirError));
        test.equal(json_rpc.getSystemErrorCode(redirError),
                   json_rpc.ERROR_CODES.forceRedirect);

        var freeze = function(req) {
            json_rpc.metaFreeze(req);
            test.throws(function() {
                            json_rpc.setFrom(req, FROM);
                        });
            test.throws(function() {
                            json_rpc.setTo(req, TO);
                        });
            test.throws(function() {
                            json_rpc.setSessionId(req, SESSION_ID);
                        });
            test.throws(function() {
                            json_rpc.setToken(req, TOKEN);
                        });
        };
        freeze(sysError);
        freeze(replyBad);
        freeze(replyOK);

        test.done();
    }
};
