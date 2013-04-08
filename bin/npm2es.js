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
    since = argv.since || 0;

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
    addDoc(doc, function() {
      this.resume();
    }.bind(this));
  }));

  stream.on('end', beginFollowing);
};

function beginFollowing() {
  console.log('BEGIN FOLLOWING @', since);

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

    last = change.seq;

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
};

function addDoc(p, fn) {
  p = normalize(p);

  if (!p || !p.name) {
    console.log('SKIP', id);
    fn && fn();
    return;
  }

  request.get({
    url: argv.es + '/package/' + p.name,
    json: true
  }, function(e,b, obj) {

    // follow gives us an update the the same document 2 times
    // 1) for the actual package.json update
    // 2) for the tarball
    // skip a re-index for #2
    if (!e && obj && obj._source && obj._source.version == p.version) {
      fn && fn()
      return;
    } else {

      // elastic search
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
        fn && fn(e);
      });
    }
  });

};

