var spawn = require('child_process').spawn,
    rimraf = require('rimraf'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    TMP_DIR = __dirname + '/tmp',
    seq = require('../lib/seq'),
    elasticsearch = require('../lib/elasticsearch'),
    http = require('http'),
    assert = require('assert');



var proc = {
  es : null,
  couch : null
};

describe('npm2es', function() {
  describe('sequence', function() {

    after(function() {
      fs.unlinkSync(seq.path);
    });

    it('should return zero on the first load', function() {
      assert.equal(seq.load(), 0);
    });

    it('should store the sequence id', function(done) {
      var expect = 19804;
      seq.save(expect, function(e) {
        assert.ok(!e);

        var data = '';
        var t = spawn(path.join(__dirname, 'tmp','seq-test'));

        t.stdout.on('data', function(d) {
          data+=d;
        });

        t.on('close', function() {
          assert(expect, parseInt(data, 10));
          done();
        });
      });
    });

    it('should use the provided seq', function(done) {

      var p = spawn(
        'node', [
          __dirname + '/../bin/npm2es.js',
          '--since=100',
          '--couch="http://bunk',
          '--es="http://bunk"'
        ], { stdio: 'pipe' });

      var data = '';

      p.stdout.on('data', function(d) {
        data += d.toString();
      });

      p.on('close', function() {
        var lines = data.split('\n').filter(function(a) {
          return a.length > 0;
        });

        assert.equal(lines.length, 1);
        assert.equal(lines[0], 'BEGIN FOLLOWING @ 100');
        done();
      });
    });


    it('should use the stashed seq', function(done) {
      seq.save(19000, function() {
        var p = spawn(
          'node', [
            __dirname + '/../bin/npm2es.js',
            '--couch="http://bunk',
            '--es="http://bunk"'
          ], { stdio: 'pipe' });

        var data = '';

        p.stdout.on('data', function(d) {
          data += d.toString();
        });

        p.on('close', function() {
          var lines = data.split('\n').filter(function(a) {
            return a.length > 0;
          });

          assert.equal(lines.length, 1);
          assert.equal(lines[0], 'BEGIN FOLLOWING @ 19000');
          done();
        });
      });
    });


    it('should use the provided over stashed', function(done) {
      seq.save(19000, function() {
        var p = spawn(
          'node', [
            __dirname + '/../bin/npm2es.js',
            '--since=1500',
            '--couch="http://bunk',
            '--es="http://bunk"'
          ], { stdio: 'pipe' });

        var data = '';

        p.stdout.on('data', function(d) {
          data += d.toString();
        });

        p.on('close', function() {
          var lines = data.split('\n').filter(function(a) {
            return a.length > 0;
          });

          assert.equal(lines.length, 1);
          assert.equal(lines[0], 'BEGIN FOLLOWING @ 1500');
          done();
        });
      });
    });

    // TODO: ensure the sequence is updated as new docs come in...
  });
});

describe('elasticsearch', function() {
  describe('#add', function() {

    describe('skip behavior', function() {
      it('should skip docs without an id', function(done) {

        var called = 0;
        var server = http.createServer(function(req, res) {
          res.writeHead(200);
          res.end('{}');
          called++;
        });
        server.listen(9999, function(e) {
          assert.ok(!e);

          elasticsearch.add('http://localhost:9999/npm', { _id : 'test' }, function(err) {
            server.close(done);
            assert.ok(err);
            assert.equal(err.message, 'SKIP: test');
            assert.equal(called, 0)
          });
        });
      });


      it('should skip if the version matches', function(done) {

        var called = 0;
        var server = http.createServer(function(req, res) {
          res.writeHead(200);
          res.end(JSON.stringify({
            _source: {
              version : "0.1.0"
            }
          }));
          called++;
        });

        server.listen(9999, function(e) {
          assert.ok(!e);

          var payload =  {
            _id : 'test',
            name : 'test',
            "dist-tags" : {
              latest: "0.1.0"
            },
            versions : {
              "0.1.0" : {
                _npmUser: { name : 'tmpvar' }
              }
            }
          };

          elasticsearch.add('http://localhost:9999/npm', payload, function(err) {
            server.close(done);
            assert.ok(err);
            assert.equal(err.message, 'SKIP VERSION: test');
            assert.equal(called, 1)
          });
        });
      });


      it('should skip docs that normalize fails on', function(done) {
        var called = 0;
        var server = http.createServer(function(req, res) {
          res.writeHead(200);
          res.end('{}');
          called++;
        });
        server.listen(9999, function(e) {
          assert.ok(!e);

          var payload = { _id : 'test', name: 'test' }
          elasticsearch.add('http://localhost:9999/npm', payload, function(err) {
            server.close(done);
            assert.ok(err);
            assert.equal(err.message, 'SKIP: test');
            assert.equal(called, 0)
          });
        });
      });

      it('should merge over top level keys of the existing document', function(done) {
        var server = http.createServer(function(req, res) {

          var method = req.method.toLowerCase();
          console.log('REQ', method);
          if (method === 'get') {
            res.writeHead(200);
            res.end(JSON.stringify({
              _source : {
                name : "test",
                extra: "keep me"
              }
            }));
          }

          if (method === 'put') {
            var data = '';
            req.on('data', function(chunk) {
              data += chunk.toString();
            });
            req.on('end', function() {
              var obj = JSON.parse(data);
              assert.equal(obj.extra, 'keep me');
              res.writeHead(200);
              res.end();
              server.close(done);
            });
          }
        });

        server.listen(9999, function(e) {
          assert.ok(!e);

          var payload =  {
            _id : 'test',
            name : 'test',
            "dist-tags" : {
              latest: "0.1.0"
            },
            versions : {
              "0.1.0" : {
                _npmUser: { name : 'tmpvar' }
              }
            }
          };
          elasticsearch.add('http://localhost:9999/npm', payload);
        });
      });

    });
  });
});


