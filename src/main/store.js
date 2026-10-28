// Arquivo JSON simples na pasta de dados do app (%APPDATA%\Cartucho no Windows).
const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  // compact: grava sem espaços. Para arquivos grandes que ninguém edita na mão (o cache da Steam passa de alguns MB),
  // a gravação fica com quase metade do tempo e do tamanho.
  constructor(file, defaults = {}, { compact = false } = {}) {
    this.file = file;
    this.defaults = defaults;
    this.compact = compact;
    this.data = { ...structuredClone(defaults), ...this.read() };
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  patch(values) {
    Object.assign(this.data, values);
    this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, this.compact ? JSON.stringify(this.data) : JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { JsonStore };
