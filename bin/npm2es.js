#!/usr/bin/env node

var argv = require('optimist').argv;
if (!argv.couch || !argv.es) {
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
    seqUrl = argv.es + '/config/sequence';

if (typeof since === 'undefined') {
  request.get({
    url : seqUrl,
    json: true
  }, function(e, r, o) {

    if (!e && o && o._source && o._source.value) {
      since = o._source.value;
    } else {
      since = 0;
    }
    beginFollowing();
  });

} else {
  request.put({
    url : seqUrl,
    json : {
      value: since
    }
  }, beginFollowing);
}

function beginFollowing() {
  console.log('BEGIN FOLLOWING @', since);
  var last = since;
  follow({
    db: argv.couch,
    since: since,
    include_docs: true
  },  function(err, change) {
    if (err) {
      return console.error('ERROR:', err.message, argv.couch);
    }

    if (!change) {
      return;
    }

    var that = this;
    this.pause();

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
        if (e || !o.ok) {
          return console.error('ERROR', 'could not save latest sequence');
        }

        console.log('SYNC', last);
      });
    }

    // Remove the document from elasticsearch
    if (change.deleted) {
      request.del(argv.es + '/package/' + change.id, function(err) {
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
        that.resume();
        return;
      }

      request.get({
        url: argv.es + '/package/' + p.name,
        json: true
      }, function(e,b, obj) {

        // follow gives us an update of the same document 2 times
        // 1) for the actual package.json update
        // 2) for the tarball
        // skip a re-index for #2
        if (!e && obj && obj._source && obj._source.version === p.version) {
          console.log('SKIP VERSION: ' + change.doc._id);
          that.resume();
        } else {
          obj = obj || {};

          if (p.dependencies) {
            p.dependencies = Object.keys(p.dependencies);
          }

          if (p.devDependencies) {
            p.devDependencies = Object.keys(p.devDependencies);
          }

          if (p.time) {
            delete p.time;
          }

          request.put({
            url: argv.es + '/package/' + p.name,
            json: extend(obj._source || {}, p)
          }, function(e, r, b) {
            if (e) {
              console.error(e.message);
            } else if (b.error) {
              console.error(b.error);
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