var json_rpc = require('../lib/json_rpc');



var TO = 'xx';
var FROM = 'yy';
var TOKEN= 'zz';
var SESSION_ID = 'vv';
var METHOD_NAME = 'doit';
var ARGS = ['hello', 'bye'];

module.exports = {

    request: function(test) {
        test.expect(18);
        var hello = {
            doit: function(hello, bye, cb) {
                test.equal(hello, ARGS[0], 'arg0 does not match');
                test.equal(bye, ARGS[1], 'arg1 does not match');
            },
            crash: function(hello, bye, cb) {
                throw new Error("Messed up");
            }
        };
        var req = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, METHOD_NAME,
                                   ARGS[0], ARGS[1]);
        json_rpc.call(req, hello, function() {});

        test.equal(json_rpc.getToken(req), TOKEN);
        test.equal(json_rpc.getTo(req), TO);
        test.equal(json_rpc.getFrom(req), FROM);
        test.equal(json_rpc.getSessionId(req), SESSION_ID);

        var meta = json_rpc.getMeta(req);
        test.equal(meta.token, TOKEN);
        test.equal(meta.to, TO);
        test.equal(meta.from, FROM);
        test.equal(meta.sessionId, SESSION_ID);

        var reqCrash = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, 'crash',
                                        ARGS[0], ARGS[1]);
        json_rpc.call(reqCrash, hello, function(err) {
                          test.equal(json_rpc.getSystemErrorMsg(err.msg),
                                     'Invalid params', 'not crashed');
                          test.equal(json_rpc.getSystemErrorCode(err.msg),
                                     json_rpc.ERROR_CODES.invalidParams,
                                     'crashed: bad errn');
                          test.equal(json_rpc.getMeta(err.msg).token, TOKEN);
                          test.equal(json_rpc.getMeta(err.msg).from, TO);
                          test.equal(json_rpc.getMeta(err.msg).to, FROM);
                          test.equal(json_rpc.getMeta(err.msg).sessionId,
                                     SESSION_ID);
                      });

        var reqNotThere = json_rpc.request(TOKEN, TO, FROM, SESSION_ID, 'ccc',
                                           ARGS[0], ARGS[1]);
        json_rpc.call(reqNotThere, hello, function(err) {
                      test.equal(json_rpc.getSystemErrorMsg(err.msg),
                                 'method not found', 'not there');
                      test.equal(json_rpc.getSystemErrorCode(err.msg),
                                 json_rpc.ERROR_CODES.methodNotFound,
                                 'not there: bad errn');
                      });


        test.done();

    }








};
