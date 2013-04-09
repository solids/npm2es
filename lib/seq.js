var fs = require('fs'),
    path = require('path');

exports.path = path.join(process.env.HOME,'.npm2es-seq');

exports.save = function(val, fn) {
  fs.writeFile(exports.path, val, fn);
};

exports.load = function() {
  try {
    var seq = fs.readFileSync(exports.path);
    return parseInt(seq.toString(), 10);
  } catch (e) {}

  return 0;
}