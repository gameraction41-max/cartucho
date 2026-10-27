const test = require('node:test');
const assert = require('node:assert');
const { parsePowerPlans } = require('../src/main/system');

test('lê os planos de energia em português, com o ativo marcado', () => {
  const out = `
Esquemas de Energia Existentes (* Ativo)
-----------------------------------
GUID do Esquema de Energia: 381b4222-f694-41f0-9685-ff5bb260df2e  (Equilibrado) *
GUID do Esquema de Energia: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (Alto desempenho)
GUID do Esquema de Energia: e9a42b02-d5df-448d-aa00-03f14749eb61  (Desempenho Máximo)
`;
  assert.deepStrictEqual(parsePowerPlans(out), [
    { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Equilibrado', active: true },
    { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', name: 'Alto desempenho', active: false },
    { guid: 'e9a42b02-d5df-448d-aa00-03f14749eb61', name: 'Desempenho Máximo', active: false },
  ]);
});

test('lê os planos de energia em inglês com quebra de linha do Windows', () => {
  const out = 'Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)\r\nPower Scheme GUID: a1841308-3541-4fab-bc81-f71556f20b4a  (Power saver) *\r\n';
  const plans = parsePowerPlans(out);
  assert.strictEqual(plans.length, 2);
  assert.strictEqual(plans[1].active, true);
  assert.strictEqual(plans[1].name, 'Power saver');
});
