#!/usr/bin/env node

var argv = require('optimist').argv;
if (!argv.couch || !argv.es) {
  return console.log('USAGE: npm2es --couch="<url to couch>" --es="<url to elasticsearch>"');
}

var request = require('request'),
    follow = require('follow'),
    normalize = require('npm-normalize'),
    JSONStream = require('JSONStream'),
    through = require('through'),
    seq = require('../lib/seq'),
    elasticsearch = require('../lib/elasticsearch'),
    since = argv.since || 0;

if (!since) {
  since = seq.load();
}

if (!since) {
  request({
    url: argv.couch,
    json: true
  }, function(e,r,obj) {
    since = obj.update_seq;
    indexAllPackages();
  });
} else {
  beginFollowing();
}

function indexAllPackages() {
  // Get all docs
  var stream = request.get(argv.couch + '/_all_docs?include_docs=true');
  stream.pipe(JSONStream.parse('rows.*.doc')).pipe(through(function(doc) {
    this.pause()
    elasticsearch.add(argv.es, doc, function(e, o) {
      if (e) {
        console.log(e.message);
      } else {
        console.log('ADD', o.name);
      }

      this.resume();
    }.bind(this));
  }));

  stream.on('end', function() {
    seq.save(since)
    beginFollowing();
  });
};

function beginFollowing() {
  console.log('BEGIN FOLLOWING @', since);

  var last = since;
  follow({
    db: argv.couch,
    since: since,
    include_docs: true
  },  function(err, change) {

    if (err) {
      return console.error('ERROR', err);
    }

    if (!change.id) {
      return console.log('SKIP', change);
    }

    if (last + 1000 < change.seq) {
      last = change.seq;
      seq.save(last);
    }

    // Remove the document elasticsearch
    if (change.deleted) {
      elasticsearch.remove(argv.es, change.id, function(err) {
        if (!err) {
          console.log('DELETED', change.id);
        } else {
          console.error('ERROR', 'could not delete document', err);
        }
      });

    // Add the doument to elasticsearch
    } else {
      elasticsearch.add(argv.es, change.doc, function(e, o) {
        if (e) {
          console.error(e.message);
        } else {
          console.log('ADD', o.name);
        }
      });
    }
  });
};

