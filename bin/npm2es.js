#!/usr/bin/env node

var argv = require('optimist').argv;
if (!argv.couch || !argv.es) {
  return console.log('USAGE: node watch.js --couch="<url to couch>" --es="<url to elasticsearch>"');
}

var request = require('request'),
    follow = require('follow'),
    normalize = require('npm-normalize'),
    url = require('url'),
    extend = require('extend');

var addDoc = function(p, cache) {
  p = normalize(p);
  if (!p || !p.name) {
    process.stdout.write('E');
    return;
  }

  // SOLR
  request.put({
    url: argv.es + '/package/' + p.name ,
    json: {
      id : p.name,
      name : p.name,
      description: p.description || '',
      readme: p.readme || '',
      homepage: p.homepage || '',
      version: p.version || '',
      keywords: p.keywords || [],
      author: p.author,
      license: p.license || [],
      modified: p.modified,
      created: p.created
    }
  }, function(e, r, b) {
    if (e) {
      console.log('FAIL', e, r, b);
      process.exit();
    } else {
      process.stdout.write('+')
    }
  });
};

follow({
  db: argv.couch,
  since: 0,
  include_docs: true
},  function(err, change) {
  process.stdout.write('.');
  if (err) {
    throw err;
  }

  if (!change.id) {
    return;
  }

  // Remove the document from the cache and from solr
  if (change.deleted) {
    request.del(argv.es + '/package/' + change.id, function(err) {
      if (!err) {
        process.stdout.write('-');
      } else {
        console.log('ERROR: could not delete solr document', err);
      }
    });
    process.stdout.write('D');

  // Add the doument to leveldb cache and solr
  } else {
    addDoc(change.doc);
  }
});
