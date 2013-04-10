#!/usr/bin/env node

var argv = require('optimist').argv;
if (!argv.couch || !argv.es) {
  return console.log('USAGE: npm2es --couch="<url to couch>" --es="<url to elasticsearch>"');
}

var follow = require('follow'),
    normalize = require('npm-normalize'),
    seq = require('../lib/seq'),
    elasticsearch = require('../lib/elasticsearch'),
    since = argv.since;

if (typeof since === 'undefined') {
  since = seq.load() || 0;
}

console.log('BEGIN FOLLOWING @', since);

var last = since;
follow({
  db: argv.couch,
  since: since,
  include_docs: true
},  function(err, change) {

  var that = this;
  this.pause();

  if (err) {
    return console.error('ERROR', err);
  }

  if (!change.id) {
    return console.log('SKIP', change);
  }

  if (last + 1000 < change.seq) {
    last = change.seq;
    seq.save(last, function(e) {
      if (e) {
        console.error('ERROR', 'could not save latest sequence');
      }
    });
  }

  // Remove the document elasticsearch
  if (change.deleted) {
    elasticsearch.remove(argv.es, change.id, function(err) {
      if (!err) {
        console.log('DELETED', change.id);
      } else {
        console.error('ERROR', 'could not delete document', err);
      }
      that.resume();
    });

  // Add the doument to elasticsearch
  } else {
    elasticsearch.add(argv.es, change.doc, function(e, o) {
      if (e) {
        console.error(e.message);
      } else {
        console.log('ADD', o.name);
      }
      that.resume();
    });
  }
});
