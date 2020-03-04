#!/usr/bin/env node
const arg = require('arg');
const path = require('path')
const fs = require('fs')
const prepare = require('../prepare.js')
const Db = require("../db.js");
const tilesConfig = JSON.parse(fs.readFileSync(path.join(__dirname,'..', "tileConfig.json"), "utf8"));

// cadastre-vt-prepare -o DB2 -p "/home/fabien/Téléchargements/dep04/04163" -t 8 -d "04"

const args = arg({
    '--path': String,
    '--dep': String,
    '--threads' : Number,
    '--ouput-path': String,

    
    // Aliases
    '-o': '--ouput-path',
    '-p': '--path',
    '-t': '--threads',
    '-d': '--dep'     
});

const inputPath =  args['--path']
const DEP = args['--dep']
const numWorkers = args['--threads']
let OUTPUTPATH =  args['--ouput-path']


const prepareDb = Db.createPrepareDb(OUTPUTPATH);
const dbData = Db.createDataDb(tilesConfig, OUTPUTPATH);

console.time('prepare')
prepare(prepareDb,dbData, inputPath,true, DEP, numWorkers )
    .then( () => {
        console.timeEnd('prepare')
    });
