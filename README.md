# npm2es

push npm package metadata into elasticsearch for querying

# install

`npm install -g npm2es`

# use

`USAGE: npm2es --couch="http://host:port/db" --es="http://host:port/index"`

## optional

  `npm2es` also takes a `--since=<seq number>` command line argument incase you want to skip a full re-index

## example

`npm2es --couch="http://localhost:5984/registry" --es="http://localhost:9200/npm"`

This will attach to the provided couchdb's `_changes` feed and automatically put every
package into elasticsearch for indexing.  This script will run for as long as you let it, automatically applying updates to the search index.

# running the tests

First off, you'll want the following installed

  * `couchdb` (i.e. `which couchdb` should work)
  * `java` (i.e. `which java` should should)
  * `mocha` (`npm install -g mocha`)

Now we can run the test, just run `npm test`

# License

MIT © 2013 solids l.l.c.