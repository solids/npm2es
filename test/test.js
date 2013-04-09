var spawn = require('child_process').spawn,
    rimraf = require('rimraf'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    TMP_DIR = __dirname + '/tmp',
    seq = require('../lib/seq'),
    assert = require('assert');

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


