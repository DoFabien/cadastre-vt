const get4ChildrenTiles = (_tiles) =>{
    // console.log(_tiles);
    let tiles = [];
    for (let tile of _tiles){
      
        let xtile, ytile, ztile
         [ztile, xtile, ytile] = tile;
        tiles = [ [ztile + 1, xtile * 2, ytile * 2], ...tiles]
        tiles = [ [ ztile + 1, xtile * 2 + 1, ytile * 2] , ...tiles]
        tiles = [ [ ztile + 1, xtile * 2 + 1, ytile * 2 + 1], ...tiles]
        tiles = [ [ztile + 1, xtile * 2, ytile * 2 + 1]  , ...tiles]
    }

    return tiles;
}

const getChildren = ( parentTile, zoomTarget) => {
    let result = [[...parentTile]]
    let tiles = [parentTile]

    while ( result[0][0] < zoomTarget){
    tiles = [...get4ChildrenTiles(tiles)]
    result = [...tiles, ...result]
    }

    return result;
}


module.exports = getChildren

