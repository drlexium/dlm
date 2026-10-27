// Checks every program in index.html against the booklet on all 8 inputs.
// The machine is simulated here independently of the page: a column fires when all three of its
// contacts are closed, a lamp lights when a jumper chain connects it to a firing column.
// Run: node check.mjs   (exit code 1 if anything breaks, apart from the two known errata)
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const PROGRAMS = Function('return ' + html.match(/const PROGRAMS = (\[[\s\S]*?\n  \]);/)[1])();
const P = Object.fromEntries(PROGRAMS.map(p => [p.id, p]));

// input n = А·4 + Б·2 + В·1; result = V·8 + X·4 + Y·2 + Z·1
function run(p, n) {
  const inp = [n >> 2 & 1, n >> 1 & 1, n & 1];
  const parent = {};
  const find = a => (parent[a] ??= a) === a ? a : (parent[a] = find(parent[a]));
  p.wires.forEach(([a, b]) => { parent[find(a)] = find(b); });
  const fired = [];
  for (let c = 0; c < 7; c++) {
    const ok = p.rows.every((row, r) => { const ch = row[c]; return ch === 'B' || ch === (inp[r] ? 'L' : 'R'); });
    if (ok) fired.push(find('C' + (c + 1)));
  }
  return [0, 1, 2, 3].reduce((s, k) => s + (fired.includes(find('L' + k)) ? 8 >> k : 0), 0);
}

const b3 = n => n.toString(2).padStart(3, '0'), b4 = n => n.toString(2).padStart(4, '0');
let failed = 0;
const errata = [];
function expect(id, n, want, why, erratum) {
  const got = run(P[id], n);
  if (got === want) return;
  const line = `${id}: вход ${b3(n)} → ${b4(got)}, ожидалось ${b4(want)}. ${why}`;
  if (erratum) errata.push(line); else { failed++; console.log('ОШИБКА ' + line); }
}
const all = f => { for (let n = 0; n < 8; n++) f(n); };

// Game 1: answers to the three questions → the number thought of. Game 9 uses the same figure.
const answers = x => (x % 2 === 0) * 4 + (x + x + 1 < 8) * 2 + [4, 5].includes((x + 10) % 6);
const numberOf = {};
all(x => { numberOf[answers(x)] = x; });
all(x => expect('game1', answers(x), x, `задумано ${x}`));
for (let x = 1; x <= 6; x++) expect('game3', answers(x), x + 7, `на кубике ${x}, плюс противоположные грани 7`);

// Game 2: everyone claims to be honest, so y is honest iff А = 1; z is honest iff В matches y.
all(n => {
  const A = n >> 2 & 1, B = n >> 1 & 1, C = n & 1;
  const y = A, z = +(C === y), x = z ? B : 1 - B;
  expect('game2', n, x * 4 + y * 2 + z, `x=${x} y=${y} z=${z}`);
});

// Games 5 and 6: 24 matches; players 1, 2, 3 took 1, 2, 3 and then the owners of А, Б, В took 1×, 2×, 4× more.
const CODE = { А: 0, Б: 1, В: 2 };
const left = {};
for (const [a, b, c] of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
  const owner = { [a]: 'А', [b]: 'Б', [c]: 'В' };
  left[24 - 6 - (a + 2 * b + 4 * c)] = CODE[owner[1]] * 4 + CODE[owner[2]];
}
all(m => expect('game5', m, left[m] ?? 0, `осталось ${m} спичек`));
all(n => expect('game6', n, left[numberOf[n]] ?? 0, `осталось ${numberOf[n]} спичек`));

// Game 9: answer number → comment number, from the booklet's table of answers and comments.
const COMMENT = [0b101, 0b111, 0b011, 0b001, 0b100, 0b110, 0b010, 0b000];
all(n => expect('game9', n, COMMENT[n], 'таблица комментариев'));

// Game 11: Y — motor runs if there is any call, X — door unlocked when it does not,
// Z — up for an up call alone, keep direction А for both calls (no calls: Z does not matter).
all(n => {
  const A = n >> 2 & 1, up = n >> 1 & 1, down = n & 1;
  const y = up | down, z = up && down ? A : up;
  const got = run(P.game11, n);
  if (!up && !down) expect('game11', n, (got & 1) | 4, 'лифт стоит, дверь открыта');
  else expect('game11', n, (1 - y) * 4 + y * 2 + z, 'лифт');
});

// Game 4: turn the die onto a side face and add it; the sum must not pass 12; whoever reaches
// exactly 12 wins; if nobody can, it is a draw. The machine gets the sum (minus 8 if over 7);
// if the advised face is not on a side, the player takes the nearest smaller side face.
// Solve the game outright (1 win, 0 draw, -1 loss for the player to move) and walk every game
// that can happen: the machine must never get less than the position allows.
const sides = t => [1, 2, 3, 4, 5, 6].filter(f => f !== t && f !== 7 - t);
const memo = {};
const after = (s, f) => s + f === 12 ? 1 : -value(s + f, f);
const value = (s, t) => memo[s + ',' + t] ??= Math.max(0, ...sides(t).filter(f => s + f <= 12).map(f => after(s, f)));
const machineMove = (s, t) => sides(t).filter(f => f <= run(P.game4, s % 8) && s + f <= 12).pop();
const RESULT = { 1: 'выигрыш', 0: 'ничья', '-1': 'проигрыш' };
const seen = new Set();
const machineTurn = (s, t) => {
  if (seen.has(s + ',' + t)) return; seen.add(s + ',' + t);
  const f = machineMove(s, t), got = f ? after(s, f) : 0;
  if (got < value(s, t))
    errata.push(`game4: сумма ${s}, сверху ${t}: машина советует ${run(P.game4, s % 8)}, игрок ставит ${f ?? '—'}, ` +
      `и вместо «${RESULT[value(s, t)]}» выходит «${RESULT[got]}»`);
  if (!f || s + f === 12) return;
  for (const g of sides(f)) if (s + f + g < 12) machineTurn(s + f + g, g);
};
for (let t = 1; t <= 6; t++) machineTurn(t, t);

// Game 8: deal 4 birds, 4 beasts, 4 insects into three piles of four every possible way and play
// the booklet's patience. Questions: А — the bottom card at «Насекомые» is an insect,
// Б — the bottom card at «Звери» is a beast, В — one of these two cards is a bird.
// Lamps, as the booklet reads them: V X Y — full success; X — birds and insects; Y — birds and
// beasts; Z — birds, probably the rest too; none — birds only.
const outcomes = {};
(function deal(cards, left) {
  if (!left.P && !left.Z && !left.N) {
    const piles = { P: cards.slice(0, 4), Z: cards.slice(4, 8), N: cards.slice(8) };
    const placed = { P: 0, Z: 0, N: 0 };
    for (let cur = 'P'; piles[cur].length;) { const c = piles[cur].shift(); placed[c]++; cur = c; }
    const done = 'PZN'.split('').filter(k => placed[k] === 4).join('');
    const n = (cards[11] === 'N') * 4 + (cards[7] === 'Z') * 2 + (cards[11] === 'P' || cards[7] === 'P');
    (outcomes[n] ??= new Set()).add(done);
    return;
  }
  for (const k of 'PZN') if (left[k]) deal([...cards, k], { ...left, [k]: left[k] - 1 });
})([], { P: 4, Z: 4, N: 4 });
const LAMPS8 = { PZN: 0b1110, PN: 0b0100, PZ: 0b0010, P: 0 };
all(n => {
  if (!outcomes[n]) return;  // such answers cannot happen
  const o = [...outcomes[n]], want = o.length === 1 ? LAMPS8[o[0]] : 0b0001;
  expect('game8', n, want, `раскладка кончается так: ${o.join(' или ')}`, true);
});

// Logic elements from the Habr article.
all(n => {
  const A = n >> 2 & 1, B = n >> 1 & 1, C = n & 1;
  expect('not', n, (1 - A) * 4 + (1 - B) * 2 + (1 - C), 'НЕ');
  expect('nand', n, +!(A && B && C), 'И-НЕ');
  expect('nor', n, +!(A || B || C), 'ИЛИ-НЕ');
  expect('xor', n, A ^ B ^ C, 'XOR');
  expect('adder', n, (A + B + C > 1) * 8 + ((A + B + C) & 1), 'сумматор');
  expect('cipher', n, n ^ 0b100, 'шифр');
});

console.log(errata.length ? 'Ошибки в самом руководстве:\n  ' + errata.join('\n  ') : 'Ошибок в руководстве не найдено');
console.log(failed ? `Расхождений с руководством: ${failed}` : 'Все остальные проверки прошли');
process.exit(failed ? 1 : 0);
