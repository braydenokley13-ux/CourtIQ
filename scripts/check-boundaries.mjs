import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const basketball = resolve(root, 'packages/basketball/src')
const errors = []
const forbiddenImports =
  /^(?:react(?:-dom)?(?:\/|$)|three(?:\/|$)|@react-three\/|next(?:\/|$)|@prisma\/|@supabase\/|@courtiq\/(?:web|db)|(?:node:)?(?:fs|path|http|https|net|child_process)(?:\/|$))|(?:^|\/)apps\/web(?:\/|$)|^@\//
const forbiddenGlobals = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'Storage',
  'Worker',
  'requestAnimationFrame',
  'cancelAnimationFrame',
])

async function files(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await files(path)))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) out.push(path)
  }
  return out
}

const domainFiles = await files(basketball)
const program = ts.createProgram(domainFiles, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts'],
  skipLibCheck: true,
  noEmit: true,
})
const checker = program.getTypeChecker()
for (const file of domainFiles) {
  const source = program.getSourceFile(file)
  const report = (node, message) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    errors.push(`${relative(root, file)}:${line + 1}: ${message}`)
  }
  function visit(node) {
    let specifier
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifier = node.moduleSpecifier.text
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifier = node.arguments[0].text
    if (specifier && (forbiddenImports.test(specifier) || (!specifier.startsWith('.') && specifier !== 'zod')))
      report(node, `Basketball can only import its own modules and its validation library: ${specifier}`)
    if (specifier?.startsWith('.') && !resolve(dirname(file), specifier).startsWith(`${basketball}/`))
      report(node, `Basketball cannot reach outside its package: ${specifier}`)
    if (specifier?.startsWith('.')) {
      const layer = relative(basketball, file).split('/')[0]
      const dependency = relative(basketball, resolve(dirname(file), specifier)).split('/')[0]
      if (layer === 'domain' && dependency !== 'domain')
        report(node, `Domain values cannot depend on ${dependency}: ${specifier}`)
      // The facade is the explicit authoring adapter. All other simulation
      // modules must execute generic values without knowing a content family.
      if (layer === 'simulation' && !file.endsWith('/facade.ts') && ['content', 'program'].includes(dependency))
        report(node, `Simulation kernel cannot depend on ${dependency}: ${specifier}`)
    }
    if (
      ts.isIdentifier(node) &&
      forbiddenGlobals.has(node.text) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      const symbol = ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node)
      // An option window is a domain value. Resolve lexical bindings so local
      // basketball vocabulary is not confused with the browser's window global.
      const locallyBound =
        symbol?.declarations?.length &&
        symbol.declarations.every((declaration) => domainFiles.includes(declaration.getSourceFile().fileName))
      if (!locallyBound) report(node, `Basketball cannot access browser infrastructure: ${node.text}`)
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'globalThis' &&
      forbiddenGlobals.has(node.name.text)
    )
      report(node, `Basketball cannot access browser infrastructure: ${node.name.text}`)
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'globalThis' &&
      ts.isStringLiteral(node.argumentExpression) &&
      forbiddenGlobals.has(node.argumentExpression.text)
    )
      report(node, `Basketball cannot access browser infrastructure: ${node.argumentExpression.text}`)
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ((node.expression.text === 'Date' && node.name.text === 'now') ||
        (node.expression.text === 'Math' && node.name.text === 'random'))
    )
      report(node, 'Domain operations must receive time and identity as inputs.')
    ts.forEachChild(node, visit)
  }
  visit(source)
}

for (const file of await files(resolve(root, 'apps/web/components/courtiq/world'))) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text
      const target = specifier.startsWith('.') ? resolve(dirname(file), specifier) : specifier
      if (/(?:^|\/)persistence(?:\/|$)|@courtiq\/basketball\/program|useProgram/.test(target))
        errors.push(`${relative(root, file)}: Rendering cannot own program persistence: ${specifier}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

// The deployed core must have no database/admin or retired account build edges.
for (const name of ['package.json', 'apps/web/package.json', 'vercel.json', 'turbo.json']) {
  const config = await readFile(resolve(root, name), 'utf8')
  if (
    /@courtiq\/db|@prisma\/|@supabase\/|prisma\s+db|accept-data-loss|seed:content|DATABASE_URL|DIRECT_URL|SUPABASE_SERVICE_ROLE_KEY/.test(
      config,
    )
  )
    errors.push(`${name}: retired backend dependency or deployment mutation remains`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log('Basketball dependency boundaries and backend-free deployment configuration pass.')
