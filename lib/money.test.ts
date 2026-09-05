import { test } from "node:test";
import assert from "node:assert/strict";
import { share, summarize, selfContained, type Shareable } from "./money.ts";

const row = (o: Partial<Shareable> = {}): Shareable => ({
  amount: 1000,
  split: "half",
  payer: "verna",
  paid: true,
  settled: false,
  ...o,
});

test("各半：奇數元多出來的 1 元歸付款人", () => {
  const r = row({ amount: 1001, payer: "verna" });
  assert.equal(share(r, "verna"), 501);
  assert.equal(share(r, "miki"), 500);
  assert.equal(share(r, "verna") + share(r, "miki"), 1001);
});

test("一方全付：另一方負擔 0", () => {
  const r = row({ split: "miki_only" });
  assert.equal(share(r, "miki"), 1000);
  assert.equal(share(r, "verna"), 0);
});

test("未付的錢不算誰欠誰", () => {
  const s = summarize([row({ paid: false })]);
  assert.equal(s.balance, 0);
  assert.equal(s.unpaid, 1000);
  assert.equal(s.paid, 0);
});

test("已付未結清：非付款人欠付款人他該負擔的那半", () => {
  assert.equal(summarize([row({ payer: "verna" })]).balance, 500);
  assert.equal(summarize([row({ payer: "miki" })]).balance, -500);
});

test("已結清就不再計入欠款", () => {
  assert.equal(summarize([row({ settled: true })]).balance, 0);
});

test("兩人各自先付一筆等額的，互相抵銷", () => {
  const s = summarize([row({ payer: "verna" }), row({ payer: "miki" })]);
  assert.equal(s.balance, 0);
  assert.equal(s.total, 2000);
  assert.equal(s.burden.verna, 1000);
  assert.equal(s.burden.miki, 1000);
});

test("應負擔總和等於總支出", () => {
  const rows = [row({ amount: 333 }), row({ amount: 1, split: "verna_only" }), row({ amount: 99, payer: "miki" })];
  const s = summarize(rows);
  assert.equal(s.burden.verna + s.burden.miki, s.total);
});

test("自己全付自己的錢，沒有欠款", () => {
  assert.ok(selfContained({ split: "verna_only", payer: "verna" }));
  assert.ok(!selfContained({ split: "verna_only", payer: "miki" }));
  assert.equal(summarize([row({ split: "verna_only", payer: "verna" })]).balance, 0);
});
