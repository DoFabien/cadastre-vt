#!/usr/bin/env node
const arg = require("arg");
const path = require("path");
const toVt = require("../toVt.js");
const fs = require("fs");

const Db = require("../db.js");
const tilesConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "tileConfig.json"), "utf8")
);

// cadastre-vt-tiles -p DB2 -t 8

const args = arg({
  "--threads": Number,
  "--path": String,

  // Aliases,
  "-p": "--path",
  "-t": "--threads"
});

const numWorkers = args["--threads"];
let OUTPUTPATH = args["--path"];

const prepareDb = Db.createPrepareDb(OUTPUTPATH);
const mbtilesDbs = Db.createMbtilesDbs(tilesConfig, OUTPUTPATH);
const dataDb = Db.createDataDb(tilesConfig, OUTPUTPATH);

console.time("vt");
toVt(prepareDb, mbtilesDbs, dataDb, numWorkers).then(() => {
  console.timeEnd("vt");
});
