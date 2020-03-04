const fs = require('fs-extra');
const path = require('path');
const prepare = require('./prepare.js')
const toVt = require('./toVt.js')
const mergeLayers = require('./mergeTiles.js')
const Db = require("./db.js");

const tilesConfig = JSON.parse(fs.readFileSync("./tileConfig.json", "utf8"));



// const filePath = '/home/fabien/Téléchargements/dep04_test'

// const filePath = '/home/fabien/Téléchargements/dep38'
const filePath = "/home/fabien/Téléchargements/dep04/04163"; //04163
const DEP = "04";
let numWorkers = 8;
let OUTPUTPATH = './DB'

const prepareData = async ()=>{
    const prepareDb = Db.createPrepareDb(OUTPUTPATH);
    console.time('prepare')
    await prepare(prepareDb, filePath, DEP, numWorkers );
    console.timeEnd('prepare')
}

const generateMbtiles = async ()=>{
    const prepareDb = Db.createPrepareDb(OUTPUTPATH);
    const mbtilesDbs = Db.createMbtilesDbs(tilesConfig, OUTPUTPATH); 
    const dataDb = Db.createDataDb(tilesConfig,OUTPUTPATH )

        
    console.time('vt')
    await toVt(prepareDb,mbtilesDbs,dataDb, numWorkers  )
    console.timeEnd('vt')
    return;

}

const mergeTilesLayers = async() => {
    const mergedDbs = Db.createMergedDb(tilesConfig,OUTPUTPATH );
    const mbtilesDbs = Db.createMbtilesDbs(tilesConfig, OUTPUTPATH);
        console.time('merge')
        await mergeLayers(mergedDbs.groupsTileConfig, mergedDbs.dbs, mbtilesDbs, numWorkers)
    console.timeEnd('merge');
    return;
   


}
// generateMbtiles();
// mergeTilesLayers();
const run = async() =>{
    await prepareData();
    await generateMbtiles();
   
    
    // await mergeTilesLayers();
}

run();