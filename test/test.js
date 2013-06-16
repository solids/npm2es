var spawn = require('child_process').spawn,
    test = require('tap').test,
    rimraf = require('rimraf'),
    http = require('http'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    TMP_DIR = __dirname + '/tmp',
    http = require('http'),
    assert = require('assert');


var launch = function(args) {
  args = args || [];
  args.unshift();
  var npm2es = spawn(__dirname + '/../bin/npm2es.js', args, { stdio: 'pipe' });
  npm2es.stderr.pipe(process.stdout);
  return npm2es;
};


var prepareCouch = function(fn) {
  var couchdb = spawn('couchdb', [
    '-a', __dirname + '/support/couch/test.ini'
  ], {
    cwd : __dirname + '/support/couch/',
    stdio: 'pipe'
  });

  couchdb.on('error', fn);

  var data = '';
  couchdb.stdout.on('data', function collector(d) {
    data+=d.toString();
    if (data.indexOf('started on') > -1) {
      couchdb.stdout.removeListener('data', collector);
      fn(null, couchdb);
    }
  });
};

var prepareElasticSearch = function(reset, fn) {
  var begin = function() {

    var es = spawn(__dirname + '/support/elasticsearch-0.20.6/bin/elasticsearch', ['-f'], {
      stdio: 'pipe'
    });
    es.on('error', fn);

    var data = '';
    es.stdout.on('data', function collector(d) {
      data+=d.toString();
      if (data.indexOf('bound_address') > -1) {
        es.stdout.removeListener('data', collector);
        setTimeout(function() {
          fn(null, es);
        }, 5000);
      }
    });
  };

  if (reset) {
    rimraf(__dirname + '/support/elasticsearch-0.20.6/data', begin);
  } else {
    begin();
  }
};

test('ensure since is written when --since is provided', function(t) {
  prepareElasticSearch(true, function(e, elasticsearch) {
    var p = launch([
      '--couch=http://blarg',
      '--es=http://localhost:10002/npm',
      '--since=100'
    ]);

    p.on('close', function() {

      request.get({
        url: "http://localhost:10002/npm/config/sequence",
        json : true
      }, function(e, r, o) {
        elasticsearch.kill();
        t.equal(o._source.value, 100);
        p.kill();
        t.end();
      });
    });
  });
});

test('ensure index is created on start', function(t) {
  prepareElasticSearch(true, function(e, elasticsearch) {
    var p = launch([
      '--couch=http://blarg',
      '--es=http://localhost:10002/non-existing-index'
    ]);

    p.on('close', function() {
      request.get({
        url: "http://localhost:10002/non-existing-index/_status",
        json : true
      }, function(e, r, o) {
        elasticsearch.kill();
        t.equal(r.statusCode, 200);
        p.kill();
        t.end();
      });
    });
  });
});

test('since is written every X _changes', function(t) {
  prepareCouch(function(e, proc) {
    t.ok(!e);
    t.ok(proc);

    var lastSeq = 0;
    var server = http.createServer(function(req, res) {
      if (req.url === '/npm/config/sequence') {
        res.writeHead(200);
        var data = '';
        req.on('data', function(chunk) {
          data += chunk.toString();
        });

        req.on('end', function() {
          try {
            var o = JSON.parse(data);
            lastSeq = o.value;
          } catch (e) {}
          res.end('{ "ok" : true }');
        });
      } else if (req.method.toLowerCase() === 'put'){
        res.writeHead(200);
        res.end('{ "ok" : true }');
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    });

    server.listen(10003);

    var p = launch([
      '--couch=http://localhost:10001/registry',
      '--es=http://localhost:10003/npm',
      '--since=0',
      '--interval=1'
    ]);

    request.get({
      url : 'http://localhost:10001/registry',
      json: true
    }, function(e, r, o) {

      var tick = setInterval(function() {
        if (lastSeq === o.update_seq-1) {
          p.kill();
          proc.kill();
          clearInterval(tick);
          server.close();
          t.end();
        }
      }, 500);
    })
  });
});

test('index all changes', function(t) {
  prepareCouch(function(e, couch) {
    t.ok(!e);

    prepareElasticSearch(true, function(e, elasticsearch) {
      t.ok(!e);

      request.del('http://localhost:10002/npm/package', function() {

        request.get({
          url: 'http://localhost:10001/registry',
          json: true
        }, function(e,r,registry) {

          var p = launch([
            '--couch=http://localhost:10001/registry',
            '--es=http://localhost:10002/npm',
            '--since=0',
            '--interval=100'
          ]);

          setTimeout(function wait() {
            request.get({
              url: 'http://localhost:10002/npm/package/_count',
              json: true
            }, function(e, r, o) {
              if (o && o.count === registry.doc_count) {
                p.kill();
                couch.kill();
                elasticsearch.kill();
                t.end();
              } else {
                setTimeout(wait, 100);
              }
            })
          }, 100);
        });
      });

    });
  });
});


test('ensure name mapping (new)', function(t) {
  prepareCouch(function(e, couch) {
    t.ok(!e);

    prepareElasticSearch(true, function(e, elasticsearch) {
      t.ok(!e);

      var p = launch([
        '--couch=http://localhost:10001/registry',
        '--es=http://localhost:10002/npm',
        '--since=0',
        '--interval=100'
      ]);

      setTimeout(function wait() {
        request.get({
          url: 'http://localhost:10002/npm/package/_mapping',
          json: true
        }, function(e, r, o) {

          if (!e && !o.error) {
            t.equal(o['package'].properties.name.type, 'multi_field');
            p.kill();
            couch.kill();
            elasticsearch.kill();
            t.end();
          } else {
            setTimeout(wait, 100);
          }
        })
      }, 100);
    });
  });
});

test('ensure name mapping (existing)', function(t) {
  prepareCouch(function(e, couch) {
    t.ok(!e);

    prepareElasticSearch(false, function(e, elasticsearch) {
      t.ok(!e);

      request.get({
        url : 'http://localhost:10002/npm/package/_mapping',
        json: true
      }, function(e, r, mapping) {


        var p = launch([
          '--couch=http://localhost:10001/registry',
          '--es=http://localhost:10002/npm',
          '--since=0',
          '--interval=100'
        ]);

        setTimeout(function wait() {
          request.get({
            url: 'http://localhost:10002/npm/package/_mapping',
            json: true
          }, function(e, r, o) {

            if (!e && !o.error) {
              t.equal(o['package'].properties.name.type, 'multi_field');

              t.equal(
                Object.keys(o['package'].properties).length,
                Object.keys(mapping['package'].properties).length
              );

              p.kill();
              couch.kill();
              elasticsearch.kill();
              t.end();
            } else {
              setTimeout(wait, 100);
            }
          })
        }, 100);
      });

    });

  });
});




