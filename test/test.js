var spawn = require('child_process').spawn,
    test = require('tap').test,
    rimraf = require('rimraf'),
    http = require('http'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    TMP_DIR = __dirname + '/tmp',
    http = require('http'),
    assert = require('assert'),
    seqPath = __dirname + '/.seq';

var proc = {
  es : null,
  couch : null
};

var launch = function(args) {
  args = args || [];
  args.unshift();
  var npm2es = spawn(__dirname + '/../bin/npm2es.js', args, { stdio: 'pipe' });
  npm2es.stderr.pipe(process.stdout);
  return npm2es;
};


var prepareCouch = function(fn) {
  var couchdb = spawn('couchdb', ['-n',
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

test('ensure since is written to disk when --since is provided', function(t) {
  var p = launch([
    '--couch=http://blarg',
    '--es=http://blarg',
    '--since=100',
    '--seq='+ seqPath
  ]);

  p.on('close', function() {
    t.equal(fs.readFileSync(seqPath).toString(), '100');
    fs.unlinkSync(seqPath);
    p.kill();
    t.end();
  });
});


test('since is written every X _changes', function(t) {
  prepareCouch(function(e, proc) {

    t.ok(!e);
    t.ok(proc);

    var server = http.createServer(function(req, res) {
      res.writeHead(200);
      res.end('{}');
    });
    server.listen(10002);

    var p = launch([
      '--couch=http://localhost:10001/registry',
      '--es=http://localhost:10002/go',
      '--seq='+ seqPath,
      '--since=0',
      '--interval=1'
    ]);

    request.get({
      url : 'http://localhost:10001/registry',
      json: true
    }, function(e, r, o) {

      var tick = setInterval(function() {
        fs.readFile(seqPath, function(e, d) {

          if (e) return;

          if (parseInt(d.toString(), 10) === o.update_seq-1) {
            p.kill();
            proc.kill();
            clearInterval(tick);
            server.close();
            fs.unlinkSync(seqPath);
            t.end();
          }
        });
      }, 50);
    })
  });
});

test('index all changes', function(t) {
  prepareCouch(function(e, couch) {
    t.ok(!e);

    prepareElasticSearch(true, function(e, elasticsearch) {
      t.ok(!e);

      request.del('http://localhost:9200/npm/package', function() {

        request.get({
          url: 'http://localhost:10001/registry',
          json: true
        }, function(e,r,registry) {

          var p = launch([
            '--couch=http://localhost:10001/registry',
            '--es=http://localhost:9200/npm',
            '--seq='+ seqPath,
            '--since=0',
            '--interval=100'
          ]);


          setTimeout(function wait() {
            request.get({
              url: 'http://localhost:9200/npm/package/_count',
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

