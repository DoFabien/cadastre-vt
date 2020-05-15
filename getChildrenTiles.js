const get4ChildrenTiles = (tile) => {
    [ztile, xtile, ytile] = tile;

    return [
        [ztile + 1, xtile * 2, ytile * 2],
        [ztile + 1, xtile * 2 + 1, ytile * 2],
        [ztile + 1, xtile * 2 + 1, ytile * 2 + 1],
        [ztile + 1, xtile * 2, ytile * 2 + 1]
    ]
}

// z x, y
const getChildren = (parentTile, zoomTarget) => {
    const initZoom = parentTile[0];
    const tileByZoom = {};

    for (let i = initZoom; i<= zoomTarget; i++){
        tileByZoom[i] = [];
    }

    tileByZoom[initZoom] = [...tileByZoom[initZoom],parentTile ]

    for ( let z in tileByZoom){
        
        if (z == zoomTarget ){
            break
        }
        for (let til of tileByZoom[z]){
            const zint = parseInt(z);
            tileByZoom[zint + 1] = [...tileByZoom[zint + 1], ...get4ChildrenTiles(til) ]
            // console.log(til)
        }
    }
    
    let result = [];
    for ( let z in tileByZoom){
        result = [...result, ...tileByZoom[z]] 
    }
    return result;
}


module.exports = getChildren

