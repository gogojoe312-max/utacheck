// app.js の中で「宣言されていない名前を使っている場所」を機械的に洗い出す。
// v12.0 で case "rvt" の中に、シート描画側の l がそのまま残っていて
// 押しても何も起きない状態になった。同じ種類の見落としを二度とやらないための検査。
const fs = require("fs");
const acorn = require("acorn");

const GLOBALS = new Set(`
window document navigator console location history screen performance localStorage sessionStorage indexedDB caches
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask
fetch Request Response Headers Blob File FileReader FormData URL URLSearchParams AbortController
Promise Object Array String Number Boolean Math JSON Date RegExp Map Set WeakMap WeakSet Symbol Proxy Reflect BigInt
Error TypeError RangeError SyntaxError ReferenceError EvalError URIError
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape
Uint8Array Uint8ClampedArray Int8Array Uint16Array Int16Array Uint32Array Int32Array Float32Array Float64Array
ArrayBuffer DataView TextEncoder TextDecoder Intl globalThis structuredClone
alert confirm prompt atob btoa getComputedStyle matchMedia scrollTo close open
Image Audio AudioContext webkitAudioContext OfflineAudioContext MediaRecorder Event CustomEvent Node Element
NaN Infinity undefined arguments this eval crypto DOMParser XMLSerializer XMLHttpRequest
pdfjsLib JSZip XLSX CompressionStream DecompressionStream module exports require process
`.trim().split(/\s+/));

const src = fs.readFileSync(process.argv[2] || "app.js", "utf8");
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: "script" });
const lineOf = (pos) => src.slice(0, pos).split("\n").length;

// --- スコープを積み上げながら歩く ---
const problems = [];

function declNames(node, out) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": out.push(node.name); break;
    case "ObjectPattern": node.properties.forEach((p) => declNames(p.type === "RestElement" ? p.argument : p.value, out)); break;
    case "ArrayPattern": node.elements.forEach((e) => declNames(e, out)); break;
    case "AssignmentPattern": declNames(node.left, out); break;
    case "RestElement": declNames(node.argument, out); break;
  }
}

// その場所で宣言されるものを、関数スコープ/ブロックスコープ両方まとめて集める
function collect(body, scope, hoistVarInto) {
  const walkStmt = (n) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "VariableDeclaration") {
      const target = n.kind === "var" ? hoistVarInto : scope;
      n.declarations.forEach((d) => { const o = []; declNames(d.id, o); o.forEach((x) => target.add(x)); });
      if (n.kind === "var") n.declarations.forEach((d) => { const o = []; declNames(d.id, o); o.forEach((x) => scope.add(x)); });
    } else if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") {
      if (n.id) scope.add(n.id.name);
    }
    // var は関数スコープなので、内側のブロックも掘る（関数の中には入らない）
    if (n.type === "BlockStatement" || n.type === "Program") n.body.forEach(walkStmt);
    else if (n.type === "IfStatement") { walkStmt(n.consequent); walkStmt(n.alternate); }
    else if (n.type === "ForStatement") { walkStmt(n.init); walkStmt(n.body); }
    else if (n.type === "ForInStatement" || n.type === "ForOfStatement") { walkStmt(n.left); walkStmt(n.body); }
    else if (n.type === "WhileStatement" || n.type === "DoWhileStatement" || n.type === "LabeledStatement") walkStmt(n.body);
    else if (n.type === "TryStatement") { walkStmt(n.block); if (n.handler) walkStmt(n.handler.body); walkStmt(n.finalizer); }
    else if (n.type === "SwitchStatement") n.cases.forEach((c) => c.consequent.forEach(walkStmt));
  };
  body.forEach(walkStmt);
}

function run(node, scopes) {
  const has = (nm) => GLOBALS.has(nm) || scopes.some((s) => s.has(nm));
  const visit = (n, parent, key) => {
    if (!n || typeof n.type !== "string") return;

    if (n.type === "Identifier") {
      if (parent) {
        if (parent.type === "MemberExpression" && key === "property" && !parent.computed) return;
        if (parent.type === "Property" && key === "key" && !parent.computed) return;
        if (parent.type === "MethodDefinition" && key === "key") return;
        if (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") return;
      }
      if (!has(n.name)) problems.push({ name: n.name, line: lineOf(n.start) });
      return;
    }

    // 新しいスコープを作るもの
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
      const sc = new Set();
      if (n.id) sc.add(n.id.name);
      sc.add("arguments");
      n.params.forEach((p) => { const o = []; declNames(p, o); o.forEach((x) => sc.add(x)); });
      n.params.forEach((p) => visitDefaults(p, scopes.concat([sc])));
      if (n.body.type === "BlockStatement") {
        collect(n.body.body, sc, sc);
        run(n.body, scopes.concat([sc]));
      } else {
        visitIn(n.body, scopes.concat([sc]));
      }
      return;
    }
    if (n.type === "BlockStatement" && parent && parent.type !== "FunctionDeclaration"
        && parent.type !== "FunctionExpression" && parent.type !== "ArrowFunctionExpression") {
      const sc = new Set();
      collect(n.body, sc, scopes[scopes.length - 1]);
      run(n, scopes.concat([sc]));
      return;
    }
    if (n.type === "SwitchStatement") {
      visit(n.discriminant, n, "discriminant");
      const sc = new Set();
      n.cases.forEach((c) => collect(c.consequent, sc, scopes[scopes.length - 1]));
      const inner = scopes.concat([sc]);
      n.cases.forEach((c) => { if (c.test) visitIn(c.test, inner); c.consequent.forEach((x) => visitIn(x, inner)); });
      return;
    }
    if (n.type === "CatchClause") {
      const sc = new Set();
      if (n.param) { const o = []; declNames(n.param, o); o.forEach((x) => sc.add(x)); }
      collect(n.body.body, sc, scopes[scopes.length - 1]);
      run(n.body, scopes.concat([sc]));
      return;
    }
    if (n.type === "ForStatement" || n.type === "ForInStatement" || n.type === "ForOfStatement") {
      const sc = new Set();
      const head = n.init || n.left;
      if (head && head.type === "VariableDeclaration") head.declarations.forEach((d) => { const o = []; declNames(d.id, o); o.forEach((x) => sc.add(x)); });
      const inner = scopes.concat([sc]);
      ["init", "left", "right", "test", "update", "body"].forEach((k) => { if (n[k]) visitIn(n[k], inner); });
      return;
    }
    if (n.type === "VariableDeclarator") { if (n.init) visit(n.init, n, "init"); return; }
    if (n.type === "MemberExpression") { visit(n.object, n, "object"); if (n.computed) visit(n.property, n, "property"); return; }
    if (n.type === "Property") { if (n.computed) visit(n.key, n, "key"); visit(n.value, n, "value"); return; }

    for (const k of Object.keys(n)) {
      if (k === "type" || k === "start" || k === "end" || k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => visit(x, n, k));
      else if (v && typeof v.type === "string") visit(v, n, k);
    }
  };
  const visitIn = (n, sc) => run({ type: "Program", body: [n.type.endsWith("Statement") || n.type.endsWith("Declaration") ? n : { type: "ExpressionStatement", expression: n, start: n.start, end: n.end }] }, sc);
  const visitDefaults = (p, sc) => { if (p.type === "AssignmentPattern") run({ type: "Program", body: [{ type: "ExpressionStatement", expression: p.right, start: p.right.start, end: p.right.end }] }, sc); };

  (node.body || []).forEach((st) => visit(st, node, "body"));
}

const top = new Set();
collect(ast.body, top, top);
run(ast, [top]);

const seen = new Map();
problems.forEach((p) => { if (!seen.has(p.name + ":" + p.line)) seen.set(p.name + ":" + p.line, p); });
const list = [...seen.values()].sort((a, b) => a.line - b.line);
if (!list.length) { console.log("○ 宣言されていない名前の使用は 0件"); process.exit(0); }
console.log("✗ 宣言されていない名前を使っています:");
list.forEach((p) => console.log(`   ${String(p.line).padStart(5)}行  ${p.name}`));
process.exit(1);
