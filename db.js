const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs-extra");

const createPrepareDb = outPath => {
  fs.ensureDirSync(path.join(outPath, "prepare"));
  const prepareDbPath = path.join(outPath, "prepare", "prepare.db");
  // const db = new Database(prapareDbPath);
  const prepareDb = new Database(prepareDbPath);
  prepareDb.pragma("journal_mode = WAL");
  prepareDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS data (z INTEGER, x INTEGER, y INTEGER, layer TEXT, uniq_key TEXT, data BLOB);`
    )
    .run();
  prepareDb
    .prepare(
      `CREATE UNIQUE  INDEX IF NOT EXISTS data_uniq_key_index on data (layer, z, x, y,uniq_key);`
    )
    .run();
  prepareDb
    .prepare(
      `CREATE INDEX IF NOT EXISTS data_tile_ndex on data (layer, z, x, y);`
    )
    .run();

  return prepareDb;
};

const createMbtilesDb = (tileConfig, outPath) => {
  fs.ensureDirSync(path.join(outPath, "mbtiles"));
  const dbPath = path.join(outPath, "mbtiles", `${tileConfig.name}.mbtiles`);
  const db = new Database(dbPath, { readonly: false });
  db.pragma("journal_mode = WAL");

  db.prepare(
    "CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);"
  ).run();
  db.prepare(
    "CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
  ).run();
  db.prepare(
    "CREATE UNIQUE  INDEX IF NOT EXISTS tile_index on tiles (zoom_level, tile_column, tile_row);"
  ).run();

  const insert = db.prepare(
    "INSERT INTO metadata (name, value) VALUES (@name, @value)"
  );

  const insertMetaData = db.transaction(metas => {
    for (const meta of metas) insert.run(meta);
  });

  let metaField = {};

  for (let f in tileConfig.fields) {
    metaField[f.name] = f.type;
  }

  const metadataJSON = {
    vector_layers: [
      {
        id: tileConfig.name,
        fields: metaField,
        minzoom: tileConfig.minZoom.toString(),
        maxzoom: tileConfig.maxZoom.toString()
      }
    ]
  };

  insertMetaData([
    { name: "format", value: "pbf" },
    { name: "name", value: tileConfig.name },
    { name: "minzoom", value: tileConfig.minZoom.toString() },
    { name: "maxzoom", value: tileConfig.maxZoom.toString() },
    { name: "version", value: "2" },
    { name: "type", value: "overlay" },
    { name: "json", value: JSON.stringify(metadataJSON) }
  ]);

  return db;
};

const createDataDb = (tilesConfig, outPath) => {
  fs.ensureDirSync(path.join(outPath, "data"));
  const dbPath = path.join(outPath, "data", `data.db`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  for (let tileConfig of tilesConfig) {
    if (tileConfig.dbData) {
      const fields = tileConfig.dbData.fields.map(f => {
        return `${f.name} ${f.type}`;
      });
      const sql = `CREATE TABLE IF NOT EXISTS ${tileConfig.name} (${fields.join(
        ", "
      )});`;

      db.prepare(sql).run();
      db.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${tileConfig.name}_uq_index on ${
          tileConfig.name
        } (${tileConfig.dbData.uniqIndex.join(", ")});`
      ).run();
      let indexs = tileConfig.dbData.indexs;
      if (indexs) {
        for (let i = 0; i < indexs.length; i++) {
          db.prepare(
            `CREATE INDEX IF NOT EXISTS ${tileConfig.name}_index_${i + 1} on ${
              tileConfig.name
            } (${indexs[i].join(", ")});`
          ).run();
        }
      }
    }
  }
  return db;
};

const createMbtilesDbs = (tilesConfig, outPath) => {
  const dbs = {};
  for (let tileConfig of tilesConfig) {
    dbs[tileConfig.name] = createMbtilesDb(tileConfig, outPath);
    // Db.createDataDb(tileConfig);
  }

  return dbs;
};

const createMergedDb = (tilesConfig, outPath) => {
  fs.ensureDirSync(path.join(outPath, "merged"));
  let dbs = {};
  let groupsTileConfig = {};
  for (let tileConfig of tilesConfig) {
    if (tileConfig.group) {
      if (!groupsTileConfig[tileConfig.group]) {
        groupsTileConfig[tileConfig.group] = [];
      }
      groupsTileConfig[tileConfig.group].push(tileConfig);
    }
  }

  for (let idGroup in groupsTileConfig) {
    const groupTileConfig = groupsTileConfig[idGroup];

    const dbPath = path.join(outPath, "merged", `${idGroup}.mbtiles`);
    dbs[idGroup] = new Database(dbPath);
    dbs[idGroup].pragma("journal_mode = WAL");

    dbs[idGroup].prepare(
      "CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);"
    ).run();
    dbs[idGroup].prepare(
      "CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
    ).run();
    dbs[idGroup].prepare(
      "CREATE UNIQUE  INDEX IF NOT EXISTS tile_index on tiles (zoom_level, tile_column, tile_row);"
    ).run();

    const insert = dbs[idGroup].prepare(
      "INSERT INTO metadata (name, value) VALUES (@name, @value)"
    );

    const insertMetaData = dbs[idGroup].transaction(metas => {
      for (const meta of metas) insert.run(meta);
    });

    let minZoom = 20;
    let maxZoom = 0;
    const vector_layers = [];
    for (let c of groupTileConfig) {
      if (c.minZoom < minZoom) {
        minZoom = c.minZoom;
      }
      if (c.maxZoom > maxZoom) {
        maxZoom = c.maxZoom;
      }
      let metaField = {};
      for (let f in c.fields) {
        metaField[f.name] = f.type;
      }

      vector_layers.push({
        id: c.name,
        fields: metaField,
        minzoom: c.minZoom.toString(),
        maxzoom: c.maxZoom.toString()
      });
    }

    insertMetaData([
      { name: "format", value: "pbf" },
      { name: "name", value: idGroup },
      { name: "minzoom", value: minZoom.toString() },
      { name: "maxzoom", value: maxZoom.toString() },
      { name: "version", value: "2" },
      { name: "type", value: "overlay" },
      { name: "json", value: JSON.stringify({ vector_layers: vector_layers }) }
    ]);
  }

  return {dbs,groupsTileConfig }
};

module.exports = { createMbtilesDbs, createDataDb, createPrepareDb, createMergedDb};
