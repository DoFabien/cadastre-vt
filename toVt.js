const fs = require("fs-extra");
const path = require("path");
const geojsonvt = require("geojson-vt");
const vtpbf = require("vt-pbf");
const Database = require("better-sqlite3");
const walk = require("fs-walk");
const Db = require("./db.js");
const turf = require("@turf/turf");
const geobuf = require("geobuf");
const Pbf = require("pbf");
const cluster = require("cluster");

const getChildrenTiles = require("./getChildrenTiles.js");
const tilesConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "tileConfig.json"), "utf8"));

let dbs = undefined;
let prepareDb = undefined;
let dbData = undefined;



const getTileVT = (tileIndex, z, x, y, layerName = "main") => {
  const layerTiles = {};
  const tileVT = tileIndex.getTile(z, x, y);


  if (tileVT) {
    const layer = new vtpbf.GeoJSONWrapper(tileVT.features);
    layer.name = layerName;
    layer.version = 2;
    layerTiles[layerName] = layer;
  } else {
    layerTiles[layerName] = {};
    layerTiles[layerName]["features"] = [];
  }

  const buff = vtpbf.fromVectorTileJs({ layers: layerTiles });
  return buff;
};


const generateVT = (tileCoords, tileConfig) => {
  const keyFieldToKeep = tileConfig.fields.map( f => f.name)
  
  if (!tileCoords){
    return;
  }
  // recupération des données d'une tuile
  const geobufData = prepareDb
    .prepare(
      `SELECT data FROM data WHERE z = ? AND x = ? AND y = ? AND layer = ?`
    )
    .all(tileCoords.z, tileCoords.x, tileCoords.y, tileConfig.name);
  const features = [];
  for (let d of geobufData) {
    const feature = geobuf.decode(new Pbf(d.data));
    const props = feature.properties;
    const filteredProperties = {}
    for (let key in props){
      // console.log(key);
      if ( keyFieldToKeep.includes(key)){
        filteredProperties[key] = props[key]
      }
    }
    feature.properties = filteredProperties;
    features.push(feature);
  }

  const geojson = {
    type: "FeatureCollection",
    features: features
  };

  const geojsonVtOptions = {
    maxZoom: tileConfig.maxZoom, // max zoom to preserve detail on
    minZoom: tileConfig.minZoom,
    tolerance: 5, // simplification tolerance (higher means simpler)
    extent: 4096, // tile extent (both width and height)
    buffer: 64, // tile buffer on each side
    indexMaxZoom: tileConfig.maxZoom,
    indexMaxPoints: 100000, // max number of points per tile in the index
    solidChildren: true, // whether to include solid tile children in the index,
    promoteId: tileConfig.promoteId || null
  };



  const tileIndex = geojsonvt(geojson, geojsonVtOptions);
  // const tilesChildren = tileIndex.tileCoords.filter( tc => tc.z >= minZoom && tc.z <= maxZoom);
  const tilesChildren = getChildrenTiles(
    [tileCoords.z, tileCoords.x, tileCoords.y],
    tileConfig.maxZoom
  );

  const dbTiles = [];
  for (let child of tilesChildren) {
    const tile = getTileVT(
      tileIndex,
      child[0],
      child[1],
      child[2],
      tileConfig.name
    );
    dbTiles.push({
      z: child[0],
      x: child[1],
      y: Math.pow(2, child[0]) - 1 - child[2],
      tile: tile
    });
  }

  // const insert = dbs[tileConfig.name].prepare(
  //   "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data ) VALUES (@z,  @x,  @y, @tile)"
  // );

  // const insertTiles = dbs[tileConfig.name].transaction(tiles => {
  //   for (const tile of tiles) insert.run(tile);
  // });

  // insertTiles(dbTiles);

  return dbTiles;


}

const exportToVt = (tileCoords, tileConfig) => {
  if (!tileCoords){
    return;
  }
  // recupération des données d'une tuile
  const geobufData = prepareDb
    .prepare(
      `SELECT data FROM data WHERE z = ? AND x = ? AND y = ? AND layer = ?`
    )
    .all(tileCoords.z, tileCoords.x, tileCoords.y, tileConfig.name);
  const features = [];
  for (let d of geobufData) {
    const feature = geobuf.decode(new Pbf(d.data));
    features.push(feature);
  }

  // push to Data db
  if (tileConfig.dbData) {
    let dataToPush = [];
    for (let feature of features) {
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
    // insertData(dataToPush);
  }

  const geojson = {
    type: "FeatureCollection",
    features: features
  };

  const geojsonVtOptions = {
    maxZoom: tileConfig.maxZoom, // max zoom to preserve detail on
    minZoom: tileConfig.minZoom,
    tolerance: 5, // simplification tolerance (higher means simpler)
    extent: 4096, // tile extent (both width and height)
    buffer: 64, // tile buffer on each side
    indexMaxZoom: tileConfig.maxZoom,
    indexMaxPoints: 100000, // max number of points per tile in the index
    solidChildren: true // whether to include solid tile children in the index
  };

  const tileIndex = geojsonvt(geojson, geojsonVtOptions);
  // const tilesChildren = tileIndex.tileCoords.filter( tc => tc.z >= minZoom && tc.z <= maxZoom);
  const tilesChildren = getChildrenTiles(
    [tileCoords.z, tileCoords.x, tileCoords.y],
    tileConfig.maxZoom
  );

  const dbTiles = [];
  for (let child of tilesChildren) {
    const tile = getTileVT(
      tileIndex,
      child[0],
      child[1],
      child[2],
      tileConfig.name
    );
    dbTiles.push({
      z: child[0],
      x: child[1],
      y: Math.pow(2, child[0]) - 1 - child[2],
      tile: tile
    });
  }

  const insert = dbs[tileConfig.name].prepare(
    "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data ) VALUES (@z,  @x,  @y, @tile)"
  );

  const insertTiles = dbs[tileConfig.name].transaction(tiles => {
    for (const tile of tiles) insert.run(tile);
  });

  insertTiles(dbTiles);
};

// console.log(tile);

const toVt = async (_prepareDb, _dbs, _dbData, numWorkers ) => {
  prepareDb = _prepareDb;
  dbs = _dbs;
  dbData = _dbData;
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

      let tilesList = prepareDb
        .prepare(`SELECT DISTINCT z, x, y, layer FROM data`)
        .all();
  

      for (var i = 0; i < numWorkers; i++) {
        cluster.fork();
      }

      cluster.on("online", worker => {
        workers = [...workers, worker.process.pid];
       
        if (tilesList[0]){
          const tc = { ...tilesConfig.find(t => t.name === tilesList[0].layer) };

          worker.send({ tileList: tilesList[0], tileConfig: tc });
          tilesList.splice(0, 1);
        }
  

        worker.on("exit", async message => {
          workers = workers.filter(id => id !== worker.process.pid);
          if (workers.length == 0) {
            setTimeout( () => {
              resolve();
            }, 20)
            
          }
        });

        worker.on("error", message => {
          reject(message);
        });

        worker.on("message", message => {
          // console.log(message);

          const _tiles = message.tiles
          .map( t => {
            return {z:t.z, x:t.x, y:t.y, tile: Buffer.from(t.tile)}
          } )

          // console.log(_tiles);
          const insert = dbs[message.tileList.layer].prepare(
            "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data ) VALUES (@z,  @x,  @y, @tile)"
          );
        
          const insertTiles = dbs[message.tileList.layer].transaction(tiles => {
            for (const tile of tiles) insert.run( tile) ;
          });

          insertTiles(_tiles);

          if (tilesList[0]) {
            const tc = {...tilesConfig.find(t => t.name === tilesList[0].layer)};
            worker.send({ tileList: tilesList[0], tileConfig: tc });
            tilesList.splice(0, 1);
          } else {
            worker.send({ exit: true });

            // console.log('fini');
          }
        });
      });
    } else {
      // worker
      process.on("message", async message => {
        if (message.exit) {
          process.exit();
        } else {
          //   console.log(message);
          const tileList = message.tileList;
          const tileConfig = message.tileConfig;
         
          
          // exportToVt(tileList, tileConfig);
         let tiles =  generateVT(tileList, tileConfig)
          
          tiles = tiles.map( t => {
            return {...t, tile: Buffer.from(t.tile)}
          })
          process.send({ pid: process.pid, tileList: tileList, tiles: tiles, layer_name: tileConfig.name, finish: true });
         
        }
      });
    }
  });
};

module.exports = toVt;

