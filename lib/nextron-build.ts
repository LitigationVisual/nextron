import fs from 'fs-extra'
import path from 'path'
import arg from 'arg'
import chalk from 'chalk'
import execa from 'execa'
import * as logger from './logger'
import { getNextronConfig } from './configs/getNextronConfig'
import { useExportCommand as checkUseExportCommand } from './configs/useExportCommand'

const args = arg({
  '--mac': Boolean,
  '--linux': Boolean,
  '--win': Boolean,
  '--x64': Boolean,
  '--ia32': Boolean,
  '--armv7l': Boolean,
  '--arm64': Boolean,
  '--universal': Boolean,
  '--config': String,
  '--publish': String,
  '--no-pack': Boolean,
  '--app-router': Boolean,
})

const cwd = process.cwd()
const appDir = path.join(cwd, 'app')
const distDir = path.join(cwd, 'dist')
const rendererSrcDir = getNextronConfig().rendererSrcDir || 'renderer'
const execaOptions: execa.Options = {
  cwd,
  stdio: 'inherit',
}

;(async () => {
  // Ignore missing dependencies
  process.env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = 'true'

  try {
    logger.info('Clearing previous builds')
    await Promise.all([fs.remove(appDir), fs.remove(distDir)])

    logger.info('Building renderer process')
    await execa('next', ['build', path.join(cwd, rendererSrcDir)], execaOptions)

    // Check if using App Router mode (standalone output)
    const isAppRouter = args['--app-router'] || (await isUsingAppRouter())

    if (isAppRouter) {
      logger.info('Detected App Router mode with standalone output')
      // For Next.js App Router with standalone output, we need to copy files differently
      await fs.copy(path.join(cwd, rendererSrcDir, '.next/standalone'), appDir)
      await fs.copy(
        path.join(cwd, rendererSrcDir, '.next/static'),
        path.join(appDir, '.next/static')
      )
      await fs.copy(
        path.join(cwd, rendererSrcDir, 'public'),
        path.join(appDir, 'public')
      )
    } else {
      // Traditional Pages Router approach with export command
      if (await useExportCommand()) {
        await execa(
          'next',
          ['export', '-o', appDir, path.join(cwd, rendererSrcDir)],
          execaOptions
        )
      }
    }

    logger.info('Building main process')
    // 使用tsup替代webpack打包主进程
    // 检查用户项目中是否有tsup.config.ts文件
    const tsupConfigPath = path.join(cwd, 'tsup.config.ts')
    const tsupConfigExists = await fs.pathExists(tsupConfigPath)

    if (tsupConfigExists) {
      // 如果用户项目有自定义的tsup配置，使用它
      await execa('tsup', ['--config', tsupConfigPath], {
        ...execaOptions,
        env: { ...process.env, NODE_ENV: 'production' },
      })
    } else {
      // 如果没有，使用默认参数
      await execa(
        'tsup',
        [
          'main/background.ts',
          'main/preload.ts',
          '--format',
          'cjs',
          '--target',
          'node16',
          '--outDir',
          'app',
          '--minify',
          '--external',
          'electron',
          '--external',
          'electron-devtools-installer',
        ],
        {
          ...execaOptions,
          env: { ...process.env, NODE_ENV: 'production' },
        }
      )
    }

    if (args['--no-pack']) {
      logger.info('Skip packaging...')
    } else {
      logger.info('Packaging - please wait a moment')
      await execa('electron-builder', createBuilderArgs(), execaOptions)
    }

    logger.info('See `dist` directory')
  } catch (err) {
    console.log(chalk`

{bold.red Cannot build electron packages:}
{bold.yellow ${err}}
`)
    process.exit(1)
  }
})()

function createBuilderArgs() {
  const results = []

  if (args['--config']) {
    results.push('--config')
    results.push(args['--config'] || 'electron-builder.yml')
  }

  if (args['--publish']) {
    results.push('--publish')
    results.push(args['--publish'])
  }

  args['--mac'] && results.push('--mac')
  args['--linux'] && results.push('--linux')
  args['--win'] && results.push('--win')
  args['--x64'] && results.push('--x64')
  args['--ia32'] && results.push('--ia32')
  args['--armv7l'] && results.push('--armv7l')
  args['--arm64'] && results.push('--arm64')
  args['--universal'] && results.push('--universal')

  return results
}

// Check if the Next.js project is using App Router with standalone output
async function isUsingAppRouter(): Promise<boolean> {
  try {
    const rendererDir = path.join(cwd, rendererSrcDir)
    const nextConfigPath = path.join(rendererDir, 'next.config.js')
    const nextConfigMjsPath = path.join(rendererDir, 'next.config.mjs')

    // Check if next.config.js or next.config.mjs exists
    const configPath = fs.existsSync(nextConfigPath)
      ? nextConfigPath
      : fs.existsSync(nextConfigMjsPath)
        ? nextConfigMjsPath
        : null

    if (!configPath) return false

    // Read the config file content
    const configContent = fs.readFileSync(configPath, 'utf8')

    // Check if the config has 'output: "standalone"' or 'output: standalone'
    return (
      configContent.includes('output:') &&
      (configContent.includes('"standalone"') ||
        configContent.includes("'standalone'") ||
        configContent.includes('output: standalone'))
    )
  } catch (error) {
    logger.info('Error checking App Router mode: ' + error)
    return false
  }
}

// For backward compatibility
async function useExportCommand() {
  try {
    return await checkUseExportCommand()
  } catch (error) {
    logger.info('Error checking export command: ' + error)
    return true
  }
}
