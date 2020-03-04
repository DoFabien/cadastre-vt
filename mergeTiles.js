const pako = require("pako")
const cluster = require("cluster");
mergedDbs = undefined;
mbtilesDb = undefined;




const mergeLayers = (groupsTileConfig, _mergedDbs, _mbtilesDb, numWorkers = 8, limit = 1000)  => {
  const nbTiles = 50; // on groupe les requetes pour les workers
    mergedDbs = _mergedDbs
    mbtilesDb = _mbtilesDb


    dataToPush = {}

    // dbData = _dbData;
    const osCPU = require("os").cpus().length;
    if (!numWorkers) {
      numWorkers = osCPU;
    }
    if (numWorkers > osCPU) {
      numWorkers = osCPU;
    }
    // numWorkers = 1;
    return new Promise(async (resolve, reject) => {
        let workers = [];
        if (cluster.isMaster) {

            let allTiles =[];
            for (let idGroup in groupsTileConfig){
              const configs = groupsTileConfig[idGroup]
          
              let tiles = {};
              for (let conf of configs){
                  // console.log(conf)
                  // TODO: distinct ?
                  const res = mbtilesDb[conf.name].prepare(`SELECT zoom_level z,  tile_column x , tile_row y  FROM tiles;`).all();
                  for (let r of res ){
                      if (!tiles[r.z]) tiles[r.z] = {};
                      if (!tiles[r.z][r.x]) tiles[r.z][r.x] = {};
                      if (!tiles[r.z][r.x][r.y]) tiles[r.z][r.x][r.y] = [];
                      tiles[r.z][r.x][r.y].push(conf.name)
                  }
              }
              const tilesArray = [];
              for (let z in tiles){
                  for (let x in tiles[z]){
                      for (let y in tiles[z][x]){
                          tilesArray.push( { z:z, x:x, y:y, sourceNames: tiles[z][x][y], idGroup:idGroup })
                      }
                  }
              }
              allTiles = [...allTiles, ...tilesArray ]
              }
              console.log('Nombre de tuiles', allTiles.length)

            for (var j = 0; j < numWorkers; j++) {
                cluster.fork();
              }

            cluster.on("online", worker => {
                workers = [...workers, worker.process.pid];
                // console.log("Worker " + worker.process.pid + " is online");
              
        
                // console.log(allTiles[0])
                if (allTiles[0]){
                    worker.send(allTiles.slice(0, nbTiles));
                    allTiles.splice(0, nbTiles);
                }
            
        
                worker.on("exit", async message => {
                  workers = workers.filter(id => id !== worker.process.pid);
                  if (workers.length == 0) {
                    for (let idGroup in dataToPush){
                        const datas = [...dataToPush[idGroup]]
                        dataToPush[idGroup] = [];
                     
                        const insert = mergedDbs[idGroup].prepare(
                            "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data ) VALUES (@z,  @x,  @y, @tile)"
                          );
                          const insertTiles = mergedDbs[idGroup].transaction(tiles => {
                            for (const tile of tiles) insert.run(tile);
                          });
                        
                          insertTiles(datas);
                    }
                 

                    resolve();
                  }
                });
        
                worker.on("error", message => {
                  reject(message);
                });
        
                worker.on("message", message => {
                    // console.log(message);
               
                    const idGroup = message.idGroup;
                    const workerData = message.data;
                    // console.log(workerData.length)
              
                    for (let d of workerData){
                      const z = Number(d.z)
                      const x = Number(d.x)
                      const y = Number(d.y)
                      const gziped = Buffer.from(d.gziped);
                      if (!dataToPush[d.idGroup]){
                        dataToPush[d.idGroup] = [];
                    }
                      dataToPush[d.idGroup].push({ z:z, x:x, y:y, tile:gziped})
                    }

      
                    if (dataToPush[idGroup].length > limit){
                      console.log('tuiles restantes :' ,allTiles.length)
                        const datas = [...dataToPush[idGroup]]
                        dataToPush[idGroup] = [];
                        const insert = mergedDbs[idGroup].prepare(
                            "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data ) VALUES (@z,  @x,  @y, @tile)"
                          );
                        
                          const insertTiles = mergedDbs[idGroup].transaction(tiles => {
                            for (const tile of tiles) insert.run(tile);
                          });
                        
                          insertTiles(datas);
                    }
               
                  if (allTiles[0]) {
                    worker.send(allTiles.slice(0, nbTiles));
                    allTiles.splice(0, nbTiles);

                   
                  } else {
                    worker.send({ exit: true });
                  }
                });
              });
        }
        else {
            // worker
            process.on("message", async message => {
              if (message.exit) {
                process.exit();
              } else {
                // console.log(message);
                const d1 = new Date().getTime();
                const data = [];
                for (let ct of message){
                  // const ct = message;
                  const sourceNames = ct.sourceNames;
                  const rawsTiles = [];
                  for (let sourceName of sourceNames){
                      const res = mbtilesDb[sourceName].prepare(`SELECT tile_data   FROM tiles WHERE zoom_level = ? AND  tile_column =  ? AND tile_row = ? ;`).get(ct.z, ct.x, ct.y);
                      rawsTiles.push(res.tile_data)
                  }
                  const mergedTiles = Buffer.concat(rawsTiles);
                  const gziped = Buffer.from(pako.gzip(mergedTiles))
                  data.push( {z: ct.z, x: ct.x, y: ct.y, idGroup:ct.idGroup , gziped})
                }
         
                process.send({ pid: process.pid,idGroup:message[0].idGroup, data:data, finish: true });
          
             
              }
            });
          }


        })
 


}

module.exports = mergeLayers;