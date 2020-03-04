# cadastre-vt

Permet de générer des tuiles vectorielles du cadastre français directement depuis les fichiers Edigeo en Node.js

## Installation

```sh
npm install -g cadastre-vt
```

## Utilisation
En 3 étapes

#### 1 : extraction des données Edigeo (cadastre-vt-prepare)

```sh
cadastre-vt-prepare -o "/data/tiles_2020" -p "/data/EDIGEO/"
```
Ce script est le plus long, il :

 1. convertit les données Edigeo en geojson
 2. les reprojectes en 4326
 3. transforme éventuellement les données attributaires (selon ce qui est indiqué dans le fichier de configuration)
 4. détermine pour chaque objet, l'appartenance aux tuiles du zoom le plus faible
 5. convertit cette "feature" en format geobuff
 6. stocke cette feature dans une base sqlite ( dans le dossier _prepare_)
 7. stocke certaines données attributaires ainsi que le bbox (dans le répertoire data -cf : [fichier de config](./tileConfig.json))

#### 2 : générations des tuiles par "layer" (cadastre-vt-tiles)

```sh
cadastre-vt-tiles -p "/data/tiles_2020" -t 16
```

Génère les tuiles vectorielles par layer en utilisant "geojson-vt".
Pour chaque layer, un fichier .mbtiles est créé dans le dossier _mbtiles_
A ce stade, les tuiles vectorielles ne sont pas compressées en _.gz_ contrairement aux [_specs_](https://github.com/mapbox/mbtiles-spec)

#### 3 fusions des layer et compression en .gzip des tuiles (cadastre-vt-merge)

```sh
cadastre-vt-merge -p "/data/tiles_2020" -t 16
```

Fusionne les tuiles des différents layers dans un fichier global selon le "group" indiqué dans le [fichier de configuration](./tileConfig.json)
Les tuiles "fusionnées" sont alors compressées en _.gz_ en utilisant [pako](https://github.com/nodeca/pako)

## Benchmark
Pour la France entière, __47.1 Go__ de données Edigeo soit __580 868 feuilles__ (fichiers tar.bz2)
Cela représente un peu plus de 91 000 000 de parcelles
La machine pour ces tests possède un CPU Ryzen 2700x ( 8 coeurs), 16Go de Ram et un ssd.

##### cadastre-vt-prepare
17311 s soit __4h50__ => 33.5 feuilles/s
Le fichier généré pèse 62 Go

##### cadastre-vt-prepare
3773 s soit ~ __1h__
Les fichiers pèsent 76 Go

##### cadastre-vt-prepare
2761 s soit ~ __45min__
On obtient un fichier de 41.5 Go (parcelle, sections, etc. -max zoom 16-) et un autre de 260 Mo pour les communes
