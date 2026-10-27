const test = require('node:test');
const assert = require('node:assert');
const s = require('../src/main/artsearch');

test('parseAlbums pega o link com nome e ignora o da imagem e os repetidos', () => {
  const html = `<table class="albumList"><tr>
    <td class="albumIcon"><a href="/game-soundtracks/album/minecraft"><img src="x.jpg"></a></td>
    <td><a href="/game-soundtracks/album/minecraft">Minecraft</a></td><td><a href="/game-soundtracks/pc">PC</a></td></tr>
    <tr><td><a href="/game-soundtracks/album/minecraft-volume-beta">Minecraft - Volume Beta &amp; Extras</a></td></tr>
    <tr><td><a href="/game-soundtracks/album/minecraft">Minecraft</a></td></tr></table>`;
  assert.deepStrictEqual(s.parseAlbums(html), [
    { id: 'minecraft', name: 'Minecraft' },
    { id: 'minecraft-volume-beta', name: 'Minecraft - Volume Beta & Extras' },
  ]);
});

test('parseTracks junta nome e duração de cada faixa', () => {
  const href = '/game-soundtracks/album/minecraft/01.%2520Key.mp3';
  const html = `<table id="songlist"><tr>
    <td class="playlistDownloadSong"><a href="${href}"><i class="material-icons">get_app</i></a></td>
    <td class="clickable-row"><a href="${href}">Key</a></td>
    <td class="clickable-row" align="right"><a href="${href}">1:05</a></td>
    <td class="clickable-row" align="right"><a href="${href}">1.03 MB</a></td></tr>
    <tr><td class="clickable-row"><a href="/game-soundtracks/album/minecraft/02.%2520Door.mp3">Door</a></td>
    <td><a href="/game-soundtracks/album/minecraft/02.%2520Door.mp3">1:52</a></td></tr>
    <tr><td><a href="/game-soundtracks/album/outro/03.mp3">Outro álbum</a></td></tr></table>`;
  assert.deepStrictEqual(s.parseTracks(html, 'minecraft'), [
    { id: href, name: 'Key', duration: '1:05' },
    { id: '/game-soundtracks/album/minecraft/02.%2520Door.mp3', name: 'Door', duration: '1:52' },
  ]);
});

test('parseSongUrl prefere o player e cai no link de download', () => {
  assert.strictEqual(s.parseSongUrl('<audio id="audio" src="https://vgmsite.com/a/01%20Key.mp3" controls></audio>'), 'https://vgmsite.com/a/01%20Key.mp3');
  assert.strictEqual(s.parseSongUrl('<a href="https://x.vgmtreasurechest.com/a/Key.mp3"><span class="songDownloadLink">MP3</span></a>'), 'https://x.vgmtreasurechest.com/a/Key.mp3');
  assert.strictEqual(s.parseSongUrl('<p>nada</p>'), null);
});

test('pickImages ordena pela nota e tira adulto e humor', () => {
  const list = [
    { id: 1, url: 'a', score: 2 },
    { id: 2, url: 'b', score: 9, thumb: 'bt', author: { name: 'Ana' } },
    { id: 3, url: 'c', score: 50, nsfw: true },
    { id: 4, url: 'd', score: 40, humor: true },
  ];
  assert.deepStrictEqual(s.pickImages(list).map((x) => [x.id, x.thumb, x.author]), [[2, 'bt', 'Ana'], [1, 'a', undefined]]);
});

test('searchTerm usa Minecraft para as instâncias e tira símbolos do nome', () => {
  assert.strictEqual(s.searchTerm({ source: 'prism', title: 'Fabulously Optimized' }), 'Minecraft');
  assert.strictEqual(s.searchTerm({ source: 'steam', title: 'DOOM™ Eternal®' }), 'DOOM Eternal');
});

test('downloadImage só aceita endereços do SteamGridDB', async () => {
  await assert.rejects(s.downloadImage('https://evil.example.com/x.png'), s.SearchError);
  await assert.rejects(s.downloadImage('http://cdn2.steamgriddb.com/x.png'), s.SearchError);
});
