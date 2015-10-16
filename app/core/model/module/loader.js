import {TemplateRegistryEntry} from 'core/model/module/template-registry-entry';
import {LoaderPlugin} from 'core/model/module/loader-plugin';

export class Loader {
  constructor() {
    this.templateRegistry = {};
  }

  map(id: string, source: string): void {
    throw new Error('Loaders must implement map(id, source).');
  }

  normalizeSync(moduleId: string, relativeTo: string): string {
    throw new Error('Loaders must implement normalizeSync(moduleId, relativeTo).');
  }

  loadModule(id: string): Promise<any> {
    throw new Error('Loaders must implement loadModule(id).');
  }

  loadAllModules(ids: string[]): Promise<any[]> {
    throw new Error('Loader must implement loadAllModules(ids).');
  }

  loadTemplate(url: string): Promise<TemplateRegistryEntry> {
    throw new Error('Loader must implement loadTemplate(url).');
  }

  loadText(url: string): Promise<string> {
    throw new Error('Loader must implement loadText(url).');
  }

  applyPluginToUrl(url: string, pluginName: string): string {
    throw new Error('Loader must implement applyPluginToUrl(url, pluginName).');
  }

  addPlugin(pluginName: string, implementation: LoaderPlugin): void {
    throw new Error('Loader must implement addPlugin(pluginName, implementation).');
  }

  getOrCreateTemplateRegistryEntry(id: string): TemplateRegistryEntry {
    let entry = this.templateRegistry[id];

    if (entry === undefined) {
      this.templateRegistry[id] = entry = new TemplateRegistryEntry(id);
    }

    return entry;
  }
}