# npm2es

push npm package metadata into elasticsearch for querying

# install

in your project to use as a library: `npm install npm2es`

or globally as a binary `npm install -g npm2es`

# use

## binary

`USAGE: npm2es --couchdb="http://host:port/db" --es="http://host:port/index"`

### example

`npm2es --couchdb="http://localhost:5984/registry" --es="http://localhost:9200/npm"

This will attach to the provided couchdb's `_changes` feed and automatically put every
package into elasticsearch for indexing.  This script will run for as long as you let it, automatically applying updates to couch to the index.

## library



# License

MIT © 2013 solids l.l.c.