import test from "node:test";
import assert from "node:assert/strict";

import {
  appendChildDigit,
  buildSupplementNumber,
  buildChildrenByParent,
  buildParentIdMap,
  collectSubtreeIds,
  compareNumbers,
  getDepth,
  getParentNumber,
  isChild,
  isDirectChild,
  renumberHierarchy,
  sortPropositions,
  validateNumber
} from "../src/numbering.js";

test("getDepth follows Tractatus digit depth", () => {
  assert.equal(getDepth("1"), 0);
  assert.equal(getDepth("1.1"), 1);
  assert.equal(getDepth("1.11"), 2);
  assert.equal(getDepth("2.01"), 1);
  assert.equal(getDepth("4.001"), 1);
  assert.equal(getDepth("2.0121"), 3);
});

test("getParentNumber trims a single trailing digit", () => {
  assert.equal(getParentNumber("1"), null);
  assert.equal(getParentNumber("1.1"), "1");
  assert.equal(getParentNumber("1.11"), "1.1");
  assert.equal(getParentNumber("2.01"), "2");
  assert.equal(getParentNumber("4.001"), "4");
  assert.equal(getParentNumber("2.0121"), "2.012");
});

test("compareNumbers sorts numerically by root and digit trail", () => {
  const values = ["1.2", "1", "2", "1.12", "1.11", "1.1", "1.21"];
  assert.deepEqual(values.sort(compareNumbers), ["1", "1.1", "1.11", "1.12", "1.2", "1.21", "2"]);
});

test("child helpers distinguish descendants from siblings", () => {
  assert.equal(isChild("1", "1.21"), true);
  assert.equal(isChild("2", "2.01"), true);
  assert.equal(isChild("2.01", "2.011"), true);
  assert.equal(isChild("1.1", "1.2"), false);
  assert.equal(isDirectChild("2", "2.01"), true);
  assert.equal(isDirectChild("2", "2.011"), false);
});

test("renumberHierarchy rebuilds numbers from sibling order and parentage", () => {
  const propositions = [
    { id: "a", number: "3", text: "" },
    { id: "b", number: "3.1", text: "" },
    { id: "c", number: "5", text: "" },
    { id: "d", number: "3.11", text: "" },
    { id: "e", number: "5.1", text: "" }
  ];

  const parentIds = buildParentIdMap(propositions);
  const childrenByParent = buildChildrenByParent(propositions, parentIds);
  const renumbered = renumberHierarchy(sortPropositions(propositions), parentIds, childrenByParent);

  assert.deepEqual(
    renumbered.map((item) => item.number),
    ["1", "1.1", "1.11", "2", "2.1"]
  );
});

test("collectSubtreeIds keeps descendants grouped under their root", () => {
  const propositions = [
    { id: "a", number: "1", text: "" },
    { id: "b", number: "1.1", text: "" },
    { id: "c", number: "1.11", text: "" },
    { id: "d", number: "2", text: "" }
  ];
  const childrenByParent = buildChildrenByParent(propositions);

  assert.deepEqual(collectSubtreeIds("b", childrenByParent), ["b", "c"]);
});

test("appendChildDigit respects the Tractatus decimal style", () => {
  assert.equal(appendChildDigit("1", "1"), "1.1");
  assert.equal(appendChildDigit("1.1", "2"), "1.12");
});

test("buildSupplementNumber inserts internal zeros but never ends with zero", () => {
  assert.equal(buildSupplementNumber("4", []), "4.01");
  assert.equal(buildSupplementNumber("4", ["4.01"]), "4.001");
  assert.equal(buildSupplementNumber("1.1", ["1.11", "1.12"]), "1.101");
});

test("validateNumber rejects terminal zero while allowing internal zero padding", () => {
  assert.equal(validateNumber("2.01"), true);
  assert.equal(validateNumber("4.001"), true);
  assert.equal(validateNumber("1.10"), false);
  assert.equal(validateNumber("2.0"), false);
});
