const fs = require('fs');
const path = require('path');

const toGeojson = require("./toGeojson.js")


const crypto = require("crypto")
const projgeojson = require('proj-geojson');


const functions = ( DEP) => {

   return {
    'addDep': (val) => `${DEP}${val}`,
    'toInt': (val) => {
        const int = parseInt(val)
        return  int ? int : null;
    },
    'toFloat': (val) => {
        if (!val) return null;
        const numberPattern = /\d+\.?\d+?/g;
        const n = val.match(numberPattern)
        if (!n) return null;
        return parseFloat(n[0])
    },
    'toDate': (val) => {
        if (!val) return null;
        const DD = val.substring(6, 8);
        const MM = val.substring(4, 6);
        const YYYY = val.substring(0, 4);
        let date = new Date(`${YYYY}-${MM}-${DD}`)
        if (isNaN(date) || YYYY < 1000) {
            return null
        }
        return date
    },
    'toDateFR': (val) => {
        if (!val) return null;
        val = val.replace(/\//g, '');
        const DD = val.substring(0, 2);
        const MM = val.substring(2, 4);
        const YYYY = val.substring(4, 8);
        let date = new Date(`${YYYY}-${MM}-${DD}`)
        if (isNaN(date) || YYYY < 1000) {
            return null
        }
        return date
    },
    'yearFromDate': (val) => {
        if (!val) return null;
        const YYYY = Number(val.substring(0, 4));
        if (!YYYY){
            return null;
        }
        if (YYYY < 1000 || YYYY > 2050){
            return null
        }
        return YYYY
    }
   }
   
}



const prepareData = function (config, data, consts,DEP) {
    const geojsons = {};

    // for (const idType in edigeoConfig.tableConfig) {
    for (let currentConf of config){
        // const currentConf = edigeoConfig.tableConfig[idType];

  
            const geojsonData = data.geojsons[currentConf.target]
            if (!geojsonData) continue;
      
            const confFields = currentConf.fields
            geojsons[currentConf.name] = {
                "type": "FeatureCollection",
                "features": []
            }

            for (feature of geojsonData.features) {
                const preparedFeature = { "type": "Feature", "geometry": feature.geometry, "properties": {} }

                if (currentConf.hashGeom) {
                    const geomhash = crypto.createHmac('sha256', JSON.stringify(feature.geometry)).digest('hex');
                    preparedFeature.properties['geomhash'] = geomhash
                }

                for (let confField of confFields) {
                    // console.log(confField)
                    let val = feature.properties[confField.target];

                    if (confField.const){
                        val = consts[confField.const];
                    }

                    if (confField.functions && confField.functions.length > 0) {
                        val = confField.functions.reduce((_val, f) => functions(DEP)[f](_val), val);
                    }
                    preparedFeature.properties[confField.name] = val;
                }
                geojsons[currentConf.name].features.push(preparedFeature);
            }
            //reprojection
        
            const inputEPSGcode = data.geojsons[currentConf.target].crs.properties.code;
           
            geojsons[currentConf.name] = projgeojson(geojsons[currentConf.name], `EPSG:${inputEPSGcode}`, `EPSG:4326`, 7);
    }
    return geojsons
}




const convertCadastreToGeojsons = async(fileName, config, dep, year= 2019) => {
    const data = await toGeojson.fromCompressed(fileName);
 
    if (!data){
        throw 'convertCadastreToGeojsons is null'
        return null;
    }
  
    // data.geojsons.PARCELLE_id.features.map( f => {
    //     console.log(f.properties);
    // })
    const commune_id = data.geojsons.COMMUNE_id.features[0].properties.IDU_id;
    const section_id = data.geojsons.SECTION_id.features[0].properties.IDU_id;
    const consts = { commune_id: commune_id, section_id:section_id}
    const preparedData = prepareData(config, data,consts, dep)
  
    return preparedData;
}



module.exports = convertCadastreToGeojsons;
