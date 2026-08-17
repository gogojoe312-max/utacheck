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

// その場所で宣言されるものを集める。
// let/const は「そのブロックだけ」。var と関数宣言だけが内側のブロックから外へ出てくる。
// ここを取り違えると、ブロックの外に漏れた const を見逃す（v12.7 の fset がこれだった）。
function collect(body, scope, hoistVarInto) {
  const own = (n) => {                      // 直下の宣言（let/const/function）
    if (!n || typeof n.type !== "string") return;
    if (n.type === "VariableDeclaration") {
      n.declarations.forEach((d) => { const o = []; declNames(d.id, o); o.forEach((x) => scope.add(x)); });
      if (n.kind === "var") n.declarations.forEach((d) => { const o = []; declNames(d.id, o); o.forEach((x) => hoistVarInto.add(x)); });
    } else if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") {
      if (n.id) scope.add(n.id.name);
    }
    deeper(n);
  };
  // 内側のブロックからは var と関数宣言だけを拾う
  const deeper = (n) => {
    const vs = (m) => {
      if (!m || typeof m.type !== "string") return;
      if (m.type === "VariableDeclaration" && m.kind === "var") {
        m.declarations.forEach((d) => { const o = []; declNames(d.id, o); o.forEach((x) => { scope.add(x); hoistVarInto.add(x); }); });
      }
      if (m.type === "FunctionDeclaration" && m.id) { scope.add(m.id.name); hoistVarInto.add(m.id.name); }
      if (m.type === "FunctionExpression" || m.type === "ArrowFunctionExpression" || m.type === "ClassDeclaration") return;
      if (m.type === "BlockStatement" || m.type === "Program") m.body.forEach(vs);
      else if (m.type === "IfStatement") { vs(m.consequent); vs(m.alternate); }
      else if (m.type === "ForStatement") { vs(m.init); vs(m.body); }
      else if (m.type === "ForInStatement" || m.type === "ForOfStatement") { vs(m.left); vs(m.body); }
      else if (m.type === "WhileStatement" || m.type === "DoWhileStatement" || m.type === "LabeledStatement") vs(m.body);
      else if (m.type === "TryStatement") { vs(m.block); if (m.handler) vs(m.handler.body); vs(m.finalizer); }
      else if (m.type === "SwitchStatement") m.cases.forEach((c) => c.consequent.forEach(vs));
    };
    if (n.type === "BlockStatement") n.body.forEach(vs);
    else if (n.type === "IfStatement") { vs(n.consequent); vs(n.alternate); }
    else if (n.type === "ForStatement") { vs(n.init); vs(n.body); }
    else if (n.type === "ForInStatement" || n.type === "ForOfStatement") { vs(n.left); vs(n.body); }
    else if (n.type === "WhileStatement" || n.type === "DoWhileStatement" || n.type === "LabeledStatement") vs(n.body);
    else if (n.type === "TryStatement") { vs(n.block); if (n.handler) vs(n.handler.body); vs(n.finalizer); }
    else if (n.type === "SwitchStatement") n.cases.forEach((c) => c.consequent.forEach(vs));
  };
  body.forEach(own);
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
