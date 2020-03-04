#!/usr/bin/env node
const arg = require("arg");
const path = require("path");
const mergeLayers = require("../mergeTiles.js");
const fs = require("fs");

const Db = require("../db.js");
const tilesConfig = JSON.parse(
  fs.readFileSync(path.join( __dirname, "..", "tileConfig.json"), "utf8")
);

// cadastre-vt-merge -p DB2 -t 8

const args = arg({
  "--threads": Number,
  "--path": String,

  // Aliases,
  "-p": "--path",
  "-t": "--threads"
});

const numWorkers = args["--threads"];
let OUTPUTPATH = args["--path"];

const mergedDbs = Db.createMergedDb(tilesConfig, OUTPUTPATH);
const mbtilesDbs = Db.createMbtilesDbs(tilesConfig, OUTPUTPATH);
console.time("merge");
mergeLayers(
  mergedDbs.groupsTileConfig,
  mergedDbs.dbs,
  mbtilesDbs,
  numWorkers
).then(() => {
  console.timeEnd("merge");
});
