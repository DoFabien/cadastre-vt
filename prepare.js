const fs = require("fs-extra");
const path = require("path");
const cluster = require("cluster");

const cover = require("@mapbox/tile-cover");
const SphericalMercator = require("@mapbox/sphericalmercator");
const convertCadastreToGeojsons = require("./cadastreToGeojsons.js");
const walk = require("fs-walk");
const Db = require('./db.js')
const geobuf = require('geobuf')
const Pbf = require('pbf')
const turf = require("@turf/turf");


const tilesConfig = JSON.parse(fs.readFileSync(path.join( __dirname, "./tileConfig.json"), "utf8"));
// Db.createPrepareDb(tilesConfig);

const functions = {
  getNumParcelleFromParcelleId: val => {
    return val.substr(10, 4);
  },
  getNumSectionFromParcelleId: val => {
    return val.substr(8, 2);
  },
  getNumPrefixFromParcelleId: val => {
    return val.substr(5, 3);
  }
};


const getBz2Files = _path => {
  const filesPaths = [];
  // return new Promise( (resolve, reject) => {
  walk.walkSync(_path, function(basedir, filename, stat) {
    if (path.extname(filename) === ".bz2") {
      filesPaths.push(path.join(basedir, filename));
    }
  });
  return filesPaths;
};



const runImport = async (prepareDb,dbData, filePath,withAttData = true, DEP, numWorkers) => {
 

const insert = prepareDb.prepare('INSERT OR REPLACE INTO data ( z, x, y,layer, uniq_key, data) VALUES ( @z, @x , @y , @layer, @uq, @data)');

const insertDatas = prepareDb.transaction((datas) => {
  for (const data of datas) insert.run(data);
});

const dispatchFeatures = (features,uqField, name,  minZoom) => {
  const datas = [];
   // console.log(tilesIds);
  for (let feature of features) {
    if (!feature.geometry || !feature.geometry.type) {
      continue;
    }
    const uniqValue = feature.properties[uqField]
    const buffer = geobuf.encode(feature, new Pbf());
    let tiles;
    try {
        tiles = cover.tiles(feature.geometry, {
        min_zoom: minZoom,
        max_zoom: minZoom
      });
    } catch (error) {
      // TROP PETIT
      console.log(JSON.stringify(feature.geometry));
      return;
      
    }
   

    for (let tile of tiles) {
      datas.push({ 
        z: tile[2],
        x:tile[0],
        y:tile[1],
        layer: name,
        uq: uniqValue,
        data: buffer
      })
    }
  }
  insertDatas(datas)
  return;
};


const pushAttData = (dbData, tileConfig, features,  ) => {


  // push to Data db
  if (tileConfig.dbData) {
    let dataToPush = [];
    for (let feature of features) {
      if (!feature || !feature.geometry || !feature.geometry.type){
        continue;
      }
      const vals = {};
      for (let field of tileConfig.dbData.fields) {
        if (field.isBbox) {
          const bbox = turf.bbox(feature);
          vals[field.name] = JSON.stringify(bbox);
        } else {
          let val = feature.properties[field["target"]];
          if (field.function) {
            val = functions[field.function](val);
          }
          vals[field.name] = val;
        }
      }
      dataToPush.push(vals);
    }

    // console.log
    const tableName = tileConfig.name;
    const fields = tileConfig.dbData.fields.map(f => f.name);
    const fieldsV = tileConfig.dbData.fields.map(f => `@${f.name}`);
    const sqlInsert = `INSERT OR REPLACE INTO ${tableName} (${fields.join(
      ", "
    )} ) VALUES ( ${fieldsV.join(", ")})`;
    const insert = dbData.prepare(sqlInsert);
    const insertData =  dbData.transaction(datas => {
      for (const data of datas) insert.run(data);
    });
    insertData(dataToPush);
  }

}


const osCPU = require("os").cpus().length;
if (!numWorkers) {
  numWorkers = osCPU;
}
if (numWorkers > osCPU) {
  numWorkers = osCPU;
}


return new Promise(async (resolve, reject) => {
    let workers = [];
  if (cluster.isMaster) {
    let count = 0;
    console.log("Master cluster setting up " + numWorkers + " workers...");

    const files = getBz2Files(filePath);
    console.log(files.length);

    for (var i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on("online", worker => {
      workers = [...workers, worker.process.pid];
      // console.log("Worker " + worker.process.pid + " is online");
      worker.send({ file: files[0], tilesConfig: tilesConfig });
      files.splice(0, 1);

      worker.on("exit", async message => {
        workers = workers.filter(id => id !== worker.process.pid);
        if (workers.length == 0) {
            resolve();
        }
      });

      worker.on("error", message => {
        reject(message);
      });

      worker.on("message", message => {
        // console.log(message.data)
        if (message.data){
          let geojsons =  message.data;
          for (let tileConfig of tilesConfig) {
            if (geojsons[tileConfig.name]) {
              dispatchFeatures(
                geojsons[tileConfig.name].features,
                tileConfig.uniqField,
                tileConfig.name,
                tileConfig.minZoom
              );
                if (withAttData){
                  pushAttData(dbData, tileConfig, geojsons[tileConfig.name].features )
                }
              
            }
          }
        }
        // console.log(message.file);
        if (files[0]) {
          count++;
          if (count % 10 == 0){
            console.log(count, message.file)
          }
        //   worker.send({ file: files[0] });
        worker.send({ file: files[0], tilesConfig: tilesConfig });
          files.splice(0, 1);
        } else {
          worker.send({ exit: true });
          worker.kill();

          // console.log('fini');
        }
      });
    });
  } else {
    process.on("message", async message => {
      if (message.exit) {
        process.exit();
      } else {
        //   console.log(message);
        const filePath = message.file;
       
        if (!filePath){
          process.exit();
        }
    
      
       
        // console.log(tilesConfig);
        const dirPath = path.parse(filePath).dir.split(path.sep)

        let _DEP = dirPath[dirPath.length -1].substr(0,2)
     
        let geojson;
        try {
          geojsons = await convertCadastreToGeojsons(
            filePath,
            tilesConfig,
            DEP ? DEP : _DEP
          );
          // console.log(geojsons)
          process.send({ pid: process.pid, file: filePath, finish: true, data:geojsons  });
          
        } catch (error) {
          console.log('oups', filePath, error)
          process.send({ pid: process.pid, file: filePath, finish: true, error:error });
        }
   

  
       
      
        // console.log(geojsons);
      }
    });
  }
});
}

module.exports = runImport;