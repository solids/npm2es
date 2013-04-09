var normalize = require('npm-normalize'),
    request = require('request');


module.exports.add = function(url, doc, fn) {
  var p = normalize(doc);

  if (!p || !p.name) {
    fn && fn(new Error('SKIP: ' + doc._id));
    return;
  }

  request.get({
    url: url + '/package/' + p.name,
    json: true
  }, function(e,b, obj) {

    // follow gives us an update the the same document 2 times
    // 1) for the actual package.json update
    // 2) for the tarball
    // skip a re-index for #2
    if (!e && obj && obj._source && obj._source.version == p.version) {
      fn && fn(new Error('SKIP VERSION: ' + doc._id));
      return;
    } else {

      var orig = obj._source;
      orig.id = p.name;
      orig.name = p.name;
      orig.description = p.description || '';
      orig.readme = p.readme || '';
      orig.homepage = p.homepage || '';
      orig.version = p.version || '';
      orig.keywords = p.keywords || [];
      orig.author = p.author;
      orig.license = p.license || [];
      orig.modified = p.modified;
      orig.created = p.created;

      // elastic search
      request.put({
        url: url + '/package/' + p.name,
        json: orig
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

module.exports.remove = function(url, id, fn) {
  request.del(argv.es + '/package/' + id, fn);
};