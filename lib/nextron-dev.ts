import arg from 'arg'
import execa from 'execa'
import { EventEmitter } from 'node:events'
import * as logger from './logger'
import { getNextronConfig } from './configs/getNextronConfig'
import { waitForPort } from 'get-port-please'
import type { ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

const args = arg({
  '--renderer-port': Number,
  '--run-only': Boolean,
  '--startup-delay': Number,
  '--electron-options': String,

  // removed since v8.11.0
  '--port': Number,
  '--remote-debugging-port': Number,
  '--inspect': Number,
})

if (args['--port']) {
  logger.error(
    `The option \`--port\` has been removed. Please use \`--renderer-port ${args['--port']}\` instead.`
  )
  process.exit(1)
}

if (args['--remote-debugging-port']) {
  logger.error(
    `The option \`--remote-debugging-port\` has been removed. Please use \`--electron-options="--remote-debugging-port=${args['--remote-debugging-port']}"\` instead.`
  )
  process.exit(1)
}

if (args['--inspect']) {
  logger.error(
    `The option \`--inspect\` has been removed. Please use \`--electron-options="--inspect=${args['--inspect']}"\` instead.`
  )
  process.exit(1)
}

const nextronConfig = getNextronConfig()

const rendererPort = args['--renderer-port'] || 8888
const startupDelay =
  nextronConfig.startupDelay || args['--startup-delay'] || 10_000

let electronOptions = args['--electron-options'] || ''
if (!electronOptions.includes('--remote-debugging-port')) {
  electronOptions += ' --remote-debugging-port=5858'
}
if (!electronOptions.includes('--inspect')) {
  electronOptions += ' --inspect=9292'
}
electronOptions = electronOptions.trim()

const execaOptions: execa.Options = {
  cwd: process.cwd(),
  stdio: 'inherit',
}

;(async () => {
  let firstCompile = true
  let mainProcess: ChildProcess
  let rendererProcess: ChildProcess
  let tsupProcess: ChildProcess

  const startMainProcess = () => {
    logger.info(
      `Run main process: electron . ${rendererPort} ${electronOptions}`
    )
    mainProcess = execa(
      'electron',
      ['.', `${rendererPort}`, ...electronOptions.split(' ')],
      {
        detached: true,
        ...execaOptions,
      }
    )
    mainProcess.unref()
  }

  const startRendererProcess = () => {
    logger.info(
      `Run renderer process: next -p ${rendererPort} ${
        nextronConfig.rendererSrcDir || 'renderer'
      }`
    )
    const child = execa(
      'next',
      ['-p', rendererPort, nextronConfig.rendererSrcDir || 'renderer'],
      execaOptions
    )
    child.on('close', () => {
      process.exit(0)
    })
    return child
  }

  const startTsupWatcher = () => {
    logger.info('Starting tsup in watch mode for main process')

    // 检查用户项目中是否有tsup.config.ts文件
    const tsupConfigPath = path.join(process.cwd(), 'tsup.config.ts')
    const tsupConfigExists = fs.existsSync(tsupConfigPath)

    let tsupArgs = ['--watch']

    if (tsupConfigExists) {
      // 如果用户项目有自定义的tsup配置，使用它
      tsupArgs = [...tsupArgs, '--config', tsupConfigPath]
    } else {
      // 如果没有，使用默认参数
      tsupArgs = [
        ...tsupArgs,
        'main/background.ts',
        'main/preload.ts',
        '--format',
        'cjs',
        '--target',
        'node16',
        '--outDir',
        'app',
        '--external',
        'electron',
        '--external',
        'electron-devtools-installer',
      ]
    }

    const child = execa('tsup', tsupArgs, execaOptions)

    // 创建一个事件派发器来监听tsup的构建完成事件
    const eventEmitter = new EventEmitter()

    child.stdout?.on('data', (data) => {
      const output = data.toString()
      if (
        output.includes('Build success') ||
        output.includes('watching for changes')
      ) {
        // 当tsup完成构建时触发事件
        eventEmitter.emit('build-complete')
      }
    })

    child.on('close', () => {
      process.exit(0)
    })

    return { process: child, events: eventEmitter }
  }

  const killWholeProcess = () => {
    if (tsupProcess) {
      tsupProcess.kill()
    }
    if (mainProcess) {
      mainProcess.kill()
    }
    if (rendererProcess) {
      rendererProcess.kill()
    }
  }

  process.on('SIGINT', killWholeProcess)
  process.on('SIGTERM', killWholeProcess)
  process.on('exit', killWholeProcess)

  rendererProcess = startRendererProcess()

  // wait until renderer process is ready
  await waitForPort(rendererPort, {
    delay: 500,
    retries: startupDelay / 500,
  }).catch(() => {
    logger.error(
      `Failed to start renderer process with port ${rendererPort} in ${startupDelay}ms`
    )
    killWholeProcess()
    process.exit(1)
  })

  // 启动tsup监视主进程代码
  const { process: tsup, events: tsupEvents } = startTsupWatcher()
  tsupProcess = tsup

  // 监听tsup构建完成事件
  tsupEvents.on('build-complete', () => {
    if (!args['--run-only']) {
      if (!firstCompile && mainProcess) {
        mainProcess.kill()
      }
      startMainProcess()

      if (firstCompile) {
        firstCompile = false
      }
    }
  })

  if (args['--run-only']) {
    // 如果只运行，等待第一次构建完成后启动主进程
    tsupEvents.once('build-complete', startMainProcess)
  }
})()
