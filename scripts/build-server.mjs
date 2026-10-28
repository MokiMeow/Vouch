import ts from "typescript";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = process.cwd();
const configPath = resolve(root, "tsconfig.server.json");
const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(read.error.messageText, "\n"),
  );
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
const output = resolve(root, "dist/server");
rmSync(output, { recursive: true, force: true });
const result = program.emit();
if (result.emitSkipped)
  throw new Error("Server compilation did not emit files");

function rewriteImports(file) {
  const source = readFileSync(file, "utf8");
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const edits = [];
  const add = (literal) => {
    if (
      !literal ||
      !ts.isStringLiteral(literal) ||
      !literal.text.startsWith(".")
    )
      return;
    const relative = literal.text;
    if ([".js", ".mjs", ".cjs", ".json", ".node"].includes(extname(relative)))
      return;
    const candidate = relative.replace(/\.ts$/, "");
    const target = existsSync(resolve(dirname(file), `${candidate}.js`))
      ? `${candidate}.js`
      : existsSync(resolve(dirname(file), candidate, "index.js"))
        ? `${candidate}/index.js`
        : null;
    if (!target)
      throw new Error(`No emitted ESM module for ${relative} in ${file}`);
    edits.push({
      start: literal.getStart(tree),
      end: literal.getEnd(),
      value: JSON.stringify(target),
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      add(node.moduleSpecifier);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  let rewritten = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    rewritten =
      rewritten.slice(0, edit.start) + edit.value + rewritten.slice(edit.end);
  writeFileSync(file, rewritten);
}
function walk(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, item.name);
    if (item.isDirectory()) walk(file);
    else if (item.isFile() && item.name.endsWith(".js")) rewriteImports(file);
  }
}
walk(output);
console.log("Production server compiled with explicit native ESM imports");
