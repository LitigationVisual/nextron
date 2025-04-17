#!/usr/bin/env node
'use strict';

var arg = require('arg');
var execa = require('execa');
var node_events = require('node:events');
var chalk = require('chalk');
var fs = require('fs');
var path = require('path');
var getPortPlease = require('get-port-please');

const info = text => {
  console.log(chalk`{cyan [nextron]} ${text}`);
};
const error = message => {
  console.log(chalk`{cyan [nextron]} {red ${message}}`);
};

const getNextronConfig = () => {
  const nextronConfigPath = path.join(process.cwd(), 'nextron.config.js');
  if (fs.existsSync(nextronConfigPath)) {
    return require(nextronConfigPath);
  } else {
    return {};
  }
};

function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), true).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (undefined !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const args = arg({
  '--renderer-port': Number,
  '--run-only': Boolean,
  '--startup-delay': Number,
  '--electron-options': String,
  // removed since v8.11.0
  '--port': Number,
  '--remote-debugging-port': Number,
  '--inspect': Number
});
if (args['--port']) {
  error(`The option \`--port\` has been removed. Please use \`--renderer-port ${args['--port']}\` instead.`);
  process.exit(1);
}
if (args['--remote-debugging-port']) {
  error(`The option \`--remote-debugging-port\` has been removed. Please use \`--electron-options="--remote-debugging-port=${args['--remote-debugging-port']}"\` instead.`);
  process.exit(1);
}
if (args['--inspect']) {
  error(`The option \`--inspect\` has been removed. Please use \`--electron-options="--inspect=${args['--inspect']}"\` instead.`);
  process.exit(1);
}
const nextronConfig = getNextronConfig();
const rendererPort = args['--renderer-port'] || 8888;
const startupDelay = nextronConfig.startupDelay || args['--startup-delay'] || 10_000;
let electronOptions = args['--electron-options'] || '';
if (!electronOptions.includes('--remote-debugging-port')) {
  electronOptions += ' --remote-debugging-port=5858';
}
if (!electronOptions.includes('--inspect')) {
  electronOptions += ' --inspect=9292';
}
electronOptions = electronOptions.trim();
const execaOptions = {
  cwd: process.cwd(),
  stdio: 'inherit'
};
(async () => {
  let firstCompile = true;
  let mainProcess;
  let rendererProcess;
  let tsupProcess;
  const startMainProcess = () => {
    info(`Run main process: electron . ${rendererPort} ${electronOptions}`);
    mainProcess = execa('electron', ['.', `${rendererPort}`, ...electronOptions.split(' ')], _objectSpread({
      detached: true
    }, execaOptions));
    mainProcess.unref();
  };
  const startRendererProcess = () => {
    info(`Run renderer process: next -p ${rendererPort} ${nextronConfig.rendererSrcDir || 'renderer'}`);
    const child = execa('next', ['-p', rendererPort, nextronConfig.rendererSrcDir || 'renderer'], execaOptions);
    child.on('close', () => {
      process.exit(0);
    });
    return child;
  };
  const startTsupWatcher = () => {
    info('Starting tsup in watch mode for main process');

    // 检查用户项目中是否有tsup.config.ts文件
    const tsupConfigPath = path.join(process.cwd(), 'tsup.config.ts');
    const tsupConfigExists = fs.existsSync(tsupConfigPath);
    let tsupArgs = ['--watch'];
    if (tsupConfigExists) {
      // 如果用户项目有自定义的tsup配置，使用它
      tsupArgs = [...tsupArgs, '--config', tsupConfigPath];
    } else {
      // 如果没有，使用默认参数
      tsupArgs = [...tsupArgs, 'main/background.ts', 'main/preload.ts', '--format', 'cjs', '--target', 'node16', '--outDir', 'app', '--external', 'electron', '--external', 'electron-devtools-installer'];
    }
    const child = execa('tsup', tsupArgs, execaOptions);

    // 创建一个事件派发器来监听tsup的构建完成事件
    const eventEmitter = new node_events.EventEmitter();
    child.stdout?.on('data', data => {
      const output = data.toString();
      if (output.includes('Build success') || output.includes('watching for changes')) {
        // 当tsup完成构建时触发事件
        eventEmitter.emit('build-complete');
      }
    });
    child.on('close', () => {
      process.exit(0);
    });
    return {
      process: child,
      events: eventEmitter
    };
  };
  const killWholeProcess = () => {
    if (tsupProcess) {
      tsupProcess.kill();
    }
    if (mainProcess) {
      mainProcess.kill();
    }
    if (rendererProcess) {
      rendererProcess.kill();
    }
  };
  process.on('SIGINT', killWholeProcess);
  process.on('SIGTERM', killWholeProcess);
  process.on('exit', killWholeProcess);
  rendererProcess = startRendererProcess();

  // wait until renderer process is ready
  await getPortPlease.waitForPort(rendererPort, {
    delay: 500,
    retries: startupDelay / 500
  }).catch(() => {
    error(`Failed to start renderer process with port ${rendererPort} in ${startupDelay}ms`);
    killWholeProcess();
    process.exit(1);
  });

  // 启动tsup监视主进程代码
  const {
    process: tsup,
    events: tsupEvents
  } = startTsupWatcher();
  tsupProcess = tsup;

  // 监听tsup构建完成事件
  tsupEvents.on('build-complete', () => {
    if (!args['--run-only']) {
      if (!firstCompile && mainProcess) {
        mainProcess.kill();
      }
      startMainProcess();
      if (firstCompile) {
        firstCompile = false;
      }
    }
  });
  if (args['--run-only']) {
    // 如果只运行，等待第一次构建完成后启动主进程
    tsupEvents.once('build-complete', startMainProcess);
  }
})();
