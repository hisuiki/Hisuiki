#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const query = process.argv[2]?.trim();
if (!query) {
  console.error("Usage: pnpm symbols <exact-symbol-name>");
  process.exitCode = 2;
} else {
  const configs = ["tsconfig.json", "server/tsconfig.json"].filter(fs.existsSync);
  const matches = [];

  for (const configPath of configs) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    );
    for (const fileName of parsed.fileNames) {
      if (fileName.endsWith(".d.ts") || fileName.includes("/node_modules/")) continue;
      const source = ts.createSourceFile(
        fileName,
        fs.readFileSync(fileName, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const visit = (node) => {
        if (ts.isIdentifier(node) && node.text === query) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source));
          const parent = node.parent;
          const declaration =
            (parent !== undefined && "name" in parent && parent.name === node) ||
            (parent !== undefined && ts.isImportSpecifier(parent) && parent.name === node);
          matches.push({
            file: path.relative(process.cwd(), source.fileName),
            line: position.line + 1,
            column: position.character + 1,
            kind: declaration ? "definition/import" : "reference",
          });
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }
  }

  if (matches.length === 0) {
    console.error(`No TypeScript symbol named '${query}' was found.`);
    process.exitCode = 1;
  } else {
    for (const match of matches.sort((a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)) {
      console.log(`${match.file}:${match.line}:${match.column}  ${match.kind}`);
    }
  }
}
