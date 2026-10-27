const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseIni, parseMmcPack, listInstances } = require('../src/main/prism');

test('parseIni lê chave=valor e ignora seções e comentários', () => {
  const ini = parseIni('[General]\nname=Fabulously Optimized\n# comentário\ntotalTimePlayed=137400\nnotes="com aspas"\n');
  assert.deepStrictEqual(ini, { name: 'Fabulously Optimized', totalTimePlayed: '137400', notes: 'com aspas' });
});

test('parseMmcPack encontra versão do Minecraft e loader', () => {
  const pack = { components: [{ uid: 'org.lwjgl3', version: '3.3.3' }, { uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.fabricmc.fabric-loader', version: '0.16.5' }] };
  assert.deepStrictEqual(parseMmcPack(pack), { mcVersion: '1.21.1', loader: 'Fabric' });
  assert.deepStrictEqual(parseMmcPack({ components: [{ uid: 'net.minecraft', version: '1.21.4' }] }), { mcVersion: '1.21.4', loader: 'Vanilla' });
});

test('listInstances lê a pasta de instâncias do Prism', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-'));
  const inst = path.join(root, 'instances', 'FO');
  fs.mkdirSync(path.join(inst, 'minecraft', 'mods'), { recursive: true });
  fs.writeFileSync(path.join(inst, 'instance.cfg'), '[General]\nname=Fabulously Optimized\ntotalTimePlayed=7200\nlastLaunchTime=1761500000000\niconKey=fo\n');
  fs.writeFileSync(path.join(inst, 'mmc-pack.json'), JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.neoforged', version: '21.1.0' }] }));
  fs.writeFileSync(path.join(inst, 'minecraft', 'mods', 'a.jar'), '');
  fs.writeFileSync(path.join(inst, 'minecraft', 'mods', 'b.jar'), '');
  fs.writeFileSync(path.join(inst, 'minecraft', 'mods', 'leia.txt'), '');
  fs.mkdirSync(path.join(root, 'icons'));
  fs.writeFileSync(path.join(root, 'icons', 'fo.png'), '');
  fs.mkdirSync(path.join(root, 'instances', 'sem-cfg'));

  const [i, ...rest] = listInstances(root);
  assert.strictEqual(rest.length, 0);
  assert.strictEqual(i.id, 'FO');
  assert.strictEqual(i.name, 'Fabulously Optimized');
  assert.strictEqual(i.seconds, 7200);
  assert.strictEqual(i.lastPlayed, 1761500000000);
  assert.strictEqual(i.loader, 'NeoForge');
  assert.strictEqual(i.mods, 2);
  assert.strictEqual(i.icon, path.join(root, 'icons', 'fo.png'));
});

test('listInstances respeita InstanceDir do prismlauncher.cfg', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-'));
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
  fs.writeFileSync(path.join(root, 'prismlauncher.cfg'), `[General]\nInstanceDir=${custom}\n`);
  fs.mkdirSync(path.join(custom, 'Vanilla'));
  fs.writeFileSync(path.join(custom, 'Vanilla', 'instance.cfg'), 'name=Vanilla Survival\n');
  assert.deepStrictEqual(listInstances(root).map((i) => i.name), ['Vanilla Survival']);
});
