#!/usr/bin/env node

var argv = require('optimist').argv;

const ES = argv.es || process.env.ES

if (!argv.couch || !ES) {
  return console.log('USAGE: npm2es --couch="<url to couch>" --es="<url to elasticsearch>" [--interval=1000]');
}

var follow = require('follow'),
    normalize = require('npm-normalize'),
    request = require('request'),
    fs = require('fs'),
    path = require('path'),
    extend = require('extend'),
    since = argv.since,
    interval = argv.interval || 1000,
    seqUrl = ES + '/config/sequence';

createIndexIfDoesNotExist(function() {
  setupSinceValue(beginFollowing);
});

function setupSinceValue(callback) {
  if (typeof since === 'undefined') {
    request.get({
      url : seqUrl,
      json: true
    }, function(e, r, o) {
      if (!r) {
        console.error('ERROR:', 'could not connect to elasticsearch (' + ES + ')');
        return console.error(o || e);
      }

      if (!e && o && o._source && o._source.value) {
        since = o._source.value;
      } else {
        since = 0;
      }
      callback();
    });

  } else {
    request.put({
      url : seqUrl,
      json : {
        value: since
      }
    }, function(e, r, o) {

      if (e) {
        throw e;
      }
      callback();
    });
  }
}

function beginFollowing() {

  request.get({
    url: ES + '/package/_mapping',
    json: true
  }, function(e, r, o) {
    var nameObj = {
      type: "multi_field",
      fields : {
        name : { type : "string", index : "analyzed" },
        untouched : { type : "string", index : "not_analyzed" }
      }
    };

    if (!e && !o.error && o.properties) {
      o['package'].properies.name = nameObj
    } else {
      o = {
        "package" : {
          properties : {
            name: nameObj
          }
        }
      };
    }

    request.put({
      url : ES + '/package/_mapping',
      json : o
    }, function() {})

  });



  console.log('BEGIN FOLLOWING @', since);
  var last = since;
  follow({
    db: argv.couch,
    since: since,
    include_docs: true,
    inactivity_ms: argv.timeout || 1000 * 60 * 60
  },  function(err, change) {

    if (err) {
      return console.error('ERROR:', err.message, argv.couch);
    }

    if (!change) {
      return console.warn('WARNING: invalid change');
    }

    var that = this;

    if (!change.id) {
      return console.log('SKIP', change);
    }

    if (last + interval < change.seq) {
      last = change.seq;
      request.put({
        url : seqUrl,
        json : {
          value: last
        }
      }, function(e, r, o) {
        if (e || r.statusCode !== 200) {
          return console.error('ERROR', 'could not save latest sequence', e, o);
        }

        console.log('SYNC', last);
      });
    }

    // Remove the document from elasticsearch
    if (change.deleted) {
      this.pause()
      request.del(ES + '/package/' + change.id, function(err) {
        if (!err) {
          console.log('DELETED', change.id);
        } else {
          console.error('ERROR', 'could not delete document', err);
        }
        that.resume();
      });

    // Add the document to elasticsearch
    } else {

      var p = normalize(change.doc);

      if (!p || !p.name) {
        console.log('SKIP: ' + change.doc._id);
        return;
      }

      // Encoding to allow scoped packages to be indexed by elasticsearch
      if(p.name[0] == '@') {
        p.name = p.name.replace('/','%2f')
      }

      this.pause();
      request.get({
        url: ES + '/package/' + p.name,
        json: true
      }, function(e,b, obj) {

        // follow gives us an update of the same document 2 times
        // 1) for the actual package.json update
        // 2) for the tarball
        // skip a re-index for #2
        if (!e && obj && obj._source && obj._source.version === p.version) {
          console.log('SKIP VERSION:', change.doc._id, p.version);
          that.resume();
        } else {
          obj = obj || {};

          if (p.time) {
            delete p.time;
          }

          request.put({
            url: ES + '/package/' + p.name,
            json: extend(obj._source || {}, p)
          }, function(e, r, b) {
            if (e) {
              console.error(e.message, p);
            } else if (b.error) {
              console.error(b.error, p);
            } else {
              console.log('ADD', p.name, r.statusCode);
            }
            that.resume();
          });
        }
      });
    }
  });
}

function createIndexIfDoesNotExist(callback) {
  request.get(ES + '/_status', function(err, res, body) {
    if (err || res.statusCode != 404) {
      callback();
      return;
    }
    request.put(ES, function(err, res, body) {
      if (err || res.statusCode != 200) {
        console.error(
          'Cannot create index: %s %s',
          err || res.statusCode,
          body
        );
      } else {
        console.log('Created elasticsearch index %s', ES);
      }
      callback();
    });
  });
}
