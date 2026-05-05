function getDotIndex(number) {
  return number.indexOf(".");
}

export function validateNumber(number) {
  return typeof number === "string" && /^[1-9]\d*(?:\.\d*[1-9])?$/.test(number.trim());
}

export function parseNumber(number) {
  const normalized = String(number).trim();

  if (!validateNumber(normalized)) {
    throw new Error(`Invalid proposition number: ${number}`);
  }

  const dotIndex = getDotIndex(normalized);

  if (dotIndex === -1) {
    return {
      root: Number(normalized),
      rootText: normalized,
      trail: ""
    };
  }

  return {
    root: Number(normalized.slice(0, dotIndex)),
    rootText: normalized.slice(0, dotIndex),
    trail: normalized.slice(dotIndex + 1)
  };
}

export function getDepth(number) {
  let depth = 0;
  let current = parseNumber(number).trail;

  while (current.length > 0) {
    current = getParentTrail(current);
    depth += 1;
  }

  return depth;
}

function getParentTrail(trail) {
  if (!trail) {
    return "";
  }

  const trimmed = trail.slice(0, -1).replace(/0+$/u, "");
  return trimmed;
}

export function getParentNumber(number) {
  const { rootText, trail } = parseNumber(number);

  if (!trail) {
    return null;
  }

  const parentTrail = getParentTrail(trail);
  return parentTrail ? `${rootText}.${parentTrail}` : rootText;
}

export function appendChildDigit(parentNumber, digit) {
  const normalizedDigit = String(digit);

  if (!/^\d+$/.test(normalizedDigit)) {
    throw new Error(`Invalid child digit: ${digit}`);
  }

  return getDotIndex(parentNumber) === -1 ? `${parentNumber}.${normalizedDigit}` : `${parentNumber}${normalizedDigit}`;
}

export function compareNumbers(left, right) {
  const a = parseNumber(left);
  const b = parseNumber(right);

  if (a.root !== b.root) {
    return a.root - b.root;
  }

  const sharedLength = Math.min(a.trail.length, b.trail.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const diff = Number(a.trail[index]) - Number(b.trail[index]);
    if (diff !== 0) {
      return diff;
    }
  }

  return a.trail.length - b.trail.length;
}

export function isChild(parentNumber, candidateNumber) {
  if (parentNumber === candidateNumber) {
    return false;
  }

  let current = getParentNumber(candidateNumber);

  while (current !== null) {
    if (current === parentNumber) {
      return true;
    }

    current = getParentNumber(current);
  }

  return false;
}

export function isDirectChild(parentNumber, candidateNumber) {
  return getParentNumber(candidateNumber) === parentNumber;
}

export function sortPropositions(propositions) {
  return [...propositions].sort((left, right) => compareNumbers(left.number, right.number));
}

export function buildParentIdMap(propositions) {
  const sorted = sortPropositions(propositions);
  const numberToId = new Map(sorted.map((proposition) => [proposition.number, proposition.id]));
  const parentIds = new Map();

  for (const proposition of sorted) {
    const parentNumber = getParentNumber(proposition.number);
    parentIds.set(proposition.id, parentNumber ? numberToId.get(parentNumber) ?? null : null);
  }

  return parentIds;
}

export function buildChildrenByParent(propositions, parentIds = buildParentIdMap(propositions)) {
  const sorted = sortPropositions(propositions);
  const orderIndex = new Map(sorted.map((proposition, index) => [proposition.id, index]));
  const childrenByParent = new Map([[null, []]]);

  const ensureBucket = (parentId) => {
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }

    return childrenByParent.get(parentId);
  };

  for (const proposition of sorted) {
    const parentId = parentIds.get(proposition.id) ?? null;
    ensureBucket(parentId).push(proposition.id);
    ensureBucket(proposition.id);
  }

  for (const bucket of childrenByParent.values()) {
    bucket.sort((leftId, rightId) => (orderIndex.get(leftId) ?? 0) - (orderIndex.get(rightId) ?? 0));
  }

  return childrenByParent;
}

export function collectSubtreeIds(rootId, childrenByParent) {
  const visited = [];

  function visit(currentId) {
    visited.push(currentId);

    for (const childId of childrenByParent.get(currentId) ?? []) {
      visit(childId);
    }
  }

  visit(rootId);
  return visited;
}

export function renumberHierarchy(propositions, parentIds, childrenByParent) {
  const byId = new Map(propositions.map((proposition) => [proposition.id, proposition]));
  const renumbered = [];
  const visited = new Set();

  function visit(parentId, parentNumber) {
    const childIds = childrenByParent.get(parentId) ?? [];

    childIds.forEach((childId, index) => {
      const source = byId.get(childId);

      if (!source) {
        return;
      }

      const nextIndex = index + 1;
      const number =
        parentId === null
          ? String(nextIndex)
          : nextIndex <= 9
            ? appendChildDigit(parentNumber, String(nextIndex))
            : null;

      if (!number) {
        throw new Error("同一親の直下には 9 件までの注解を想定しています。必要なら手動番号編集で調整してください。");
      }

      const updated = { ...source, number };
      renumbered.push(updated);
      visited.add(childId);
      visit(childId, number);
    });
  }

  visit(null, null);

  if (visited.size !== propositions.length) {
    throw new Error("再採番に失敗しました。親子関係が壊れている可能性があります。");
  }

  return renumbered;
}

export function buildSupplementNumber(baseNumber, existingNumbers) {
  const existing = new Set(existingNumbers);
  let zeroPadding = "0";

  while (existing.has(`${baseNumber}.${zeroPadding}1`) || existing.has(`${baseNumber}${zeroPadding}1`)) {
    zeroPadding += "0";
  }

  return getDotIndex(baseNumber) === -1 ? `${baseNumber}.${zeroPadding}1` : `${baseNumber}${zeroPadding}1`;
}
