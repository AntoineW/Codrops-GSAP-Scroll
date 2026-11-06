import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import * as sass from 'sass'
import browserSync from 'browser-sync'
import { watch } from 'chokidar'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const isDev = process.argv.includes('--dev')

/**
 * Compile scripts and styles
 */
async function buildAssets () {
  const styles = await sass.compileAsync('src/scss/style.scss', {
    style: isDev ? 'expanded' : 'compressed',
  })
  const lenisStyles = await readFile('node_modules/lenis/dist/lenis.css', 'utf8')

  await mkdir('dist/css', { recursive: true })
  await build({
    entryPoints: ['src/js/script.js'],
    outfile: 'dist/js/script.js',
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: !isDev,
    sourcemap: isDev,
    logLevel: 'info',
  })
  await writeFile('dist/css/style.css', `${lenisStyles}\n${styles.css}\n`)
  if (!isDev) await rm('dist/js/script.js.map', { force: true })
}

/**
 * Resolve asset paths relative to the built HTML
 */
async function buildHtml () {
  const html = await readFile('index.html', 'utf8')
  await writeFile('dist/index.html', html.replace(/\b(href|src|content)="\.\/dist\//g, '$1="./'))
}

await buildAssets()
if (!isDev) await buildHtml()

if (isDev) {
  const server = browserSync.create()
  server.init({
    server: '.',
    port: 3000,
    open: false,
    notify: false,
    ui: false,
    ghostMode: false,
  })

  let pendingBuild = Promise.resolve()
  const watcher = watch(['src', 'index.html'], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher.on('all', () => {
    pendingBuild = pendingBuild.then(async () => {
      await buildAssets()
      server.reload()
    }).catch(error => console.error(error))
  })

  process.on('SIGINT', async () => {
    await watcher.close()
    await pendingBuild
    server.exit()
  })
}
