#!/usr/bin/env node

var argv = require('optimist').argv;
if (!argv.couch || !argv.es) {
  return console.log('USAGE: npm2es --couch="<url to couch>" --es="<url to elasticsearch>"');
}

var request = require('request'),
    follow = require('follow'),
    normalize = require('npm-normalize');


var addDoc = function(p) {
  var id = p.id;
  p = normalize(p);

  if (!p || !p.name) {
    return console.log('SKIP', id);
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
      console.error('FAIL', e, r, b);
    } else {
      console.log('ADD', p.name);
    }
  });
};

follow({
  db: argv.couch,
  since: 0,
  include_docs: true
},  function(err, change) {

  if (err) {
    return console.error('ERROR', err);
  }

  if (!change.id) {
    return console.log('SKIP', change);
  }

  // Remove the document from the cache and from solr
  if (change.deleted) {
    request.del(argv.es + '/package/' + change.id, function(err) {
      if (!err) {
        console.log('DELETED', change.id);
      } else {
        console.error('ERROR', 'could not delete document', err);
      }
    });

  // Add the doument to leveldb cache and solr
  } else {
    addDoc(change.doc);
  }
});
