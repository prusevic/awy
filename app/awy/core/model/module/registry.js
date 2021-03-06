import * as moduleConstants from 'awy/core/model/module.js';

class Core_Model_Module_Registry extends Class {
	constructor(key: Object) {
		super();
        this.logger = Class.i('awy_core_model_logger', 'Module_Registry');
        this.config = [];
        /**
	    * Current module name, not null when:
	    * - In module bootstrap
	    * - In observer
	    * - In view
	    */
	    this._currentModuleName = null;	
    	this._currentModuleStack = [];
    	/**
    	 * modules instances, collected from manifests
    	 */
    	this._modules = new Map();
    }

    pushModule(name) {
        //console.log('pushing module ' + name);
    	this._currentModuleStack.push(name);
        return this;
    }

    popModule() {
    	let name = this._currentModuleStack.pop();
        //console.log('poping module ' + name);
        return this;
    }

    currentModuleName() {
        if (this._currentModuleStack.length > 0) {
            return this._currentModuleStack[this._currentModuleStack.length-1];
        }
        return null;
    }
    /**
     * Run modules bootstrap callbacks
     */
	async bootstrap() {
        let module;
        for (module of Array.from(this._modules.values())) {
            this.pushModule(module.module_name);
            await module.onBeforeBootstrap();
            this.popModule();
        }
        //console.log('after BeforeBootstrap');
        for (module of Array.from(this._modules.values())) {
            this.pushModule(module.module_name);
            await module.onBootstrap();
            this.popModule();
        }
        console.log('after Bootstrap');
        // let layout = await Class.i('awy_core_model_layout');
        //layout.collectAllViewsFiles();
        //console.log('after collectAllViewsFiles');
        let layout = await Class.i('awy_core_model_events');
        await layout.fire('ModuleRegistry::bootstrap:after');
        return this;
	}

    onBootstrap() {
        /*
        let fncs = Array.from(this._modules.values());
        let first = fncs.shift();
        this.pushModule(first.module_name);
        fncs.reduce((cur, next, index) => {
            this.popModule();
            this.pushModule(fncs[index].module_name);
            return cur.then(next.bootstrap());
        }, first.bootstrap());
*/
    }
    
    /*
    processBeforeBootstrapCallback() {
        let fncs = Array.from(this._modules.values());
        let first = fncs.shift();
        this.pushModule(first.module_name);
        fncs.reduce((cur, next, index) => {
            this.popModule();
            this.pushModule(fncs[index].module_name);
            return cur.then(next.onBeforeBootstrapCallback());
        }, Promise.resolve(first.onBeforeBootstrapCallback()));
    }
    */
    // Scan for all enabled module manifest files
	async scan() {
        (await this.logger).debug('Module Registry scan');
        let defined = await this.getEnabled();
        let manifests = await this.fetchManifests(defined);
        (await this.logger).debug(manifests);
        let modules = await this.initModules(manifests);
        //(await this.logger).debug(modules);
        let index;
        for (index in modules) { 
            this._modules.set(modules[index].module_name, modules[index]);
        }
        await this.processRequires();
        await this.processDefaultConfig();
        (await this.logger).debug('Finished scan');
        return this;
	}
	/* 
     * return all defined and hard enabled modules, as promise
     */
	async getEnabled() {
        (await this.logger).debug('Fetching enabled modules from /app/modules.js');
        let m = await System.import('modules.js');
        let result = [];
        for (let key of Object.keys(m.default)) {
            if (m.default[key].enabled) {
              result.push( [key, m.default[key]] );
            }
        }
        (await this.logger).debug(result);
        return result;
	}

    /* 
     * return all manifest.js files of all enabled modules
     */
    async fetchManifests(defined) {
        (await this.logger).debug('Fetching manifest.js files of all enabled modules.');
        let promises = defined.map(async function([key, value]) {
            key = key.replace(/_/g,'/');
            let m = await System.import(key + '/manifest.js');
            m.default.key = key;
            return m.default;
        });
        let manifests = await Promise.all(promises);
        return manifests;
    }
    /* 
     * return initilized modules for all passed manifests, as promise
     */
    async initModules(manifests){
        (await this.logger).debug('Initilizing module objects for all manifests');
        let promises = manifests.map(manifest => {
            if (!('module_name' in manifest)) {
                throw "Invalid or empty manifest file: " + manifest.key + '/manifest.js';
            }
            manifest.manifest_file = manifest.key + '/manifest.js';
            return ClassRegistry.getInstance('awy_core_model_module', false, manifest);
        });
        let loadedModules = await Promise.all(promises);
        return loadedModules;
    }

	get configuration() {
		return this.config;
	}

	async processRequires() {
        await this.checkRequires();
        (await this.logger).debug('Perform topological sorting for module dependencies');
        return this.sortRequires();
    }
    /*
     * Creating global configuration from peaces contained in each module
     * asynch with concurency
     */
    async processDefaultConfig() {
        (await this.logger).debug('Processing default configuration for all modules');
        let module;
        for (module of Array.from(this._modules.values())) {
            await module.processDefaultConfig();
        }
        return this;
    }
    // check modules and switch either to PENDING or ERROR run_status
    async checkRequires() {
        // validate required modules
        (await this.logger).debug('Checking for required modules and modules with errors');
        let config = await Class.i('awy_core_model_config');
        let util = await Class.i('awy_core_util_misc');
        let requestRunLevels = config.get('module_run_levels/request');
        let modName;
        for (modName in requestRunLevels) {     
            if (this._modules.has(modName)) {
                this._modules.get(modName).run_level = requestRunLevels[modName]; //run level
            } else {
                if (requestRunLevels[modName] === moduleConstants.REQUIRED) {
                    throw new Error('Module is required but not found: ' + modName);
                }
            }
        }

        for (let [modName1, mod] of this._modules) {
            // switch into pending state if required
            if (mod.run_level === moduleConstants.REQUIRED) {
                mod.run_status = moduleConstants.PENDING;
            }
            // iterate over require for modules
            if ('require' in mod && 'module' in mod.require) {
                let req;
                for (req in mod.require.module) {
                    let reqMod = this._modules.get(req) || false;
                    // is the module missing
                    if (!reqMod) {
                        mod.errors.push({type: 'missing', mod: req});
                        continue;
                    // is the module disabled
                    } else if (reqMod.run_level === moduleConstants.DISABLED) {
                        mod.errors.push({type: 'disabled', mod: req});
                        continue;
                    // is the module version not equal to required
                    } else if (!util.version_compare(reqMod.version, mod.require.module[req], '=')) {
                        mod.errors.push({type: 'version', mod: req});
                        continue;
                    }
                    // set parents
                    if (!(req in mod.parents)) {
                        mod.parents.push(req);
                    }
                    // set children
                    if ( !(modName1 in reqMod.children)) {
                        reqMod.children.push(modName1);
                    }
                    // if module is ok to run, set it's parents/dependencies as ok to run as well
                    if (mod.run_status === moduleConstants.PENDING) {
                        reqMod.run_status = moduleConstants.PENDING;
                    }
                }
                delete mod.require.module[req];
            }
            // switch into pending state if no errors 
            if (mod.errors.length == 0 && mod.run_level === moduleConstants.REQUESTED) {
                mod.run_status = moduleConstants.PENDING;
            }
        }

        for (let [modName2, mod2] of this._modules) {
            if (typeof mod2 !== 'object') {
                console.error(mod2); return;
            }
            if (mod2.errors.length > 0 && !mod2.errors_propagated) {
                this.propagateErrors(mod2);
            } else if (mod2.run_status === moduleConstants.PENDING) {
                this.propagateRequires(mod2);
            }  
        }
    }

    // If module has errors, flag the run status to ERROR and do the same to all of it's required children
    propagateErrors(mod) {
        mod.run_status = moduleConstants.ERROR;
        mod.errors_propagated = true;
        let childName;
        for (childName of mod.children) {
            if (!this._modules.has(childName)) {
                continue;
            }
            let child = this._modules.get(childName);
            if (child.run_level === moduleConstants.REQUIRED && child.run_status !== moduleConstants.ERROR) {
                this.propagateRequireErrors(child);
            }
        }
        return this;
    }
    // if module is ok to run, flag the run status to PENDING for all of it's parent modules
    propagateRequires(mod) {
        let parentName;
        for (parentName of mod.parents) {
            if (!this._modules.has(parentName)) {
                continue;
            }
            parent = this._modules.get(parentName);
            if (parent.run_status === moduleConstants.PENDING) {
                continue;
            }
            parent.run_status = moduleConstants.PENDING;
            this.propagateRequires(parent);
        }
        return this;
    }
    // checking circular dependencies
    // ordering modules loading sequence based on configuration
    sortRequires() {
        //clone this._modules for temp use
        let modules = this._modules;//new Map(JSON.parse(JSON.stringify(Array.from(this._modules))));        
        let circRefsArr = [];
        for (let [modName, mod] of modules) {
            let circRefs = this.detectCircularReferences(mod);
            if (circRefs.length) {
                let circ;
                for (circ of circRefs) {
                    circRefsArr.push(circ.join(' -> '));
                    let s = circ.length;
                    let mod1name = circ[s-1];
                    let mod2name = circ[s-2];
                    let modul1 = modules.get(mod1name);
                    let modul2 = modules.get(mod2name);
                    let p;
                    for (p of modul1.parents) {
                        if (p === mod2name) {
                            modul1.parents.splice(modul1.parents.indexOf(p),1);
                        }
                    }
                    let c;
                    for (c of modul2.children) {
                        if (c === mod1name) {
                            modul2.children.splice(modul2.children.indexOf(c),1);
                        }
                    }
                }
            }
        }
        let circRef;
        for(circRef of circRefsArr) {
            console.warn('Circular reference detected: ' + circRef);
        }
        // take care of 'load_after' option
        for (let [modName1, mod1] of modules) {
            mod1.children_copy = mod1.children;
            if ('load_after' in mod1 && Array.isArray(mod1.load_after)) {
                for (let n of mod1.load_after) {
                    if (!modules.has(n)) {
                        throw new Error('Invalid module name specified in load_after: ' + n);
                        continue;
                    }
                    mod1.parents.push(n);
                    modules.get(n).children.push(modName1);
                }
            }
        }
        // get modules without dependencies
        let rootModules = [];
        for (let [modName2, mod2] of modules) {
            if (!mod2.parents.length) {
                rootModules.push(mod2);
            }
        }
        let sorted = new Map();
        //let module_keys = Object.keys(modules);
        while(modules.size) {
            if (circRefsArr.length) {
                throw new Error('Circular reference detected, aborting module sorting');
                //return false;
            }
            // remove this node from root modules and add it to the output
            let n = rootModules.pop();
            sorted.set(n.module_name, n);
            let c = n.children.length - 1;
            // for each of its children: queue the new node, finally remove the original
            while(c >= 0) {
            //for (let c in n.children) {
                // get child module
                let childModule = modules.get(n.children[c]);
                //console.log(childModule);
                // remove child modules from parent
                n.children.splice(c,1);
                //console.log(n.children);
                // remove parent from child module
                childModule.parents.splice(childModule.parents.indexOf(n.module_name),1);
                // check if this child has other parents. if not, add it to the root modules list
                if (!childModule.parents.length) { rootModules.push(childModule); }
                
                c--;
            }
            // remove processed module from list
            modules.delete(n.module_name);
            //module_keys.length--;
        }
        // move modules that have load_after=='ALL' to the end of list
        let srt = [];
        for (let [modName3, mod3] of sorted) {
            if (mod3.load_after === 'ALL') {
                sorted.delete(modName3);
                /*  ES6 Loader complains about delete followed by set on Map
                    So, srt Array is used instead
                if (!sorted.has(modName3)) {
                    sorted.set(modName3,mod3);
                }
                */
                srt.push(mod3);
            }
        }
        srt.forEach(function(obj) {
            sorted.set(obj.module_name, obj);
        });
        this._modules = sorted;
        return this;
    }

    /**
     * Detect circular module dependencies references
     */
    detectCircularReferences(mod, depPathArr = []) {
        let circ = [];
        //console.log(mod.module_name);
        //console.log(depPathArr);
        //console.log(mod.parents);
        if (mod.parents.length) {
            for (let p of mod.parents) {
                //console.log(p + ' is parent of ' + mod.module_name );
                if (!!~depPathArr.indexOf(p)) {
                    //console.log('depPathArr contains ' + p);
                    let found = false;
                    let circPath = [];
                    let k;
                    for (k of depPathArr) {
                        //console.log(p + 'k in depPathArr ' + k);
                        if (p === k) {
                            found = true;
                        }
                        if (found) {
                            circPath.push(k);
                        }
                    }
                    circPath.push(p);
                    circ.push(circPath);
                } else {
                    //console.log('depPathArr does not contain ' + p);
                    let depPathArr1 = JSON.parse(JSON.stringify(depPathArr));
                    depPathArr1.push(p);
                    let b = this.detectCircularReferences(this._modules.get(p), depPathArr1);
                    circ = [...new Set([...circ, ...b])]
                }
                
            }
        } else {
            //console.log(mod.module_name  + ' has no parents and so no circ deps possible');
        }

        return circ;
    }

    expandPath(path) {
        if (path[0] !== '@') {
            return path;
        }
        let parts = path.split("/");
        let mod = this._modules.get(parts.shift().substr(1));
        if (!mod) {
            return path;
        }
        return mod.root_dir + '/' + parts.join("/");
    }
}

export default Core_Model_Module_Registry