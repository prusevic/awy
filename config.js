// https://google.github.io/traceur-compiler/bin/traceur.js 
System.paths['traceur'] = '/lib/traceur.js';
// auto loader
System.paths['*'] = '/app/*.js';

System.traceurOptions = {
    annotations: true,
    types: true,
    memberVariables: true,
    debug: true
};

/*
System.import('app/bootstrap');
*/

