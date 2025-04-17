#!/usr/bin/env node
'use strict';

var fs$1 = require('fs-extra');
var path = require('path');
var arg = require('arg');
var chalk = require('chalk');
var execa = require('execa');
var fs = require('fs');

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

/* eslint-disable @typescript-eslint/no-var-requires */

const cwd$1 = process.cwd();
const pkgPath = path.join(cwd$1, 'package.json');
const nextConfigPath = path.join(cwd$1, getNextronConfig().rendererSrcDir || 'renderer', 'next.config.js');
const useExportCommand$1 = async () => {
  const {
    dependencies,
    devDependencies
  } = await fs$1.readJSON(pkgPath);
  let nextVersion;
  nextVersion = dependencies.next;
  if (nextVersion) {
    info('To reduce the bundle size of the electron app, we recommend placing next and nextron in devDependencies instead of dependencies.');
  }
  if (!nextVersion) {
    nextVersion = devDependencies.next;
    if (!nextVersion) {
      error('Next not found in both dependencies and devDependencies.');
      process.exit(1);
    }
  }
  const majorVersion = ~~nextVersion.split('.').filter(v => v.trim() !== '')[0].replace('^', '').replace('~', '');
  if (majorVersion < 13) {
    return true;
  }
  if (majorVersion === 13) {
    const {
      output,
      distDir
    } = require(nextConfigPath);
    if (output === 'export') {
      if (distDir !== '../app') {
        error('Nextron export the build results to "app" directory, so please set "distDir" to "../app" in next.config.js.');
        process.exit(1);
      }
      return false;
    }
    return true;
  }
  if (majorVersion > 13) {
    const {
      output,
      distDir
    } = require(nextConfigPath);
    if (output !== 'export') {
      error('We must export static files so as Electron can handle them. Please set next.config.js#output to "export".');
      process.exit(1);
    }
    if (distDir !== '../app') {
      error('Nextron exports the build results to "app" directory, so please set "distDir" to "../app" in next.config.js.');
      process.exit(1);
    }
    return false;
  }
  error('Unexpected error occerred');
  process.exit(1);
};

function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), true).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (undefined !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
  '--app-router': Boolean
});
const cwd = process.cwd();
const appDir = path.join(cwd, 'app');
const distDir = path.join(cwd, 'dist');
const rendererSrcDir = getNextronConfig().rendererSrcDir || 'renderer';
const execaOptions = {
  cwd,
  stdio: 'inherit'
};
(async () => {
  // Ignore missing dependencies
  process.env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = 'true';
  try {
    info('Clearing previous builds');
    await Promise.all([fs$1.remove(appDir), fs$1.remove(distDir)]);
    info('Building renderer process');
    await execa('next', ['build', path.join(cwd, rendererSrcDir)], execaOptions);

    // Check if using App Router mode (standalone output)
    const isAppRouter = args['--app-router'] || (await isUsingAppRouter());
    if (isAppRouter) {
      info('Detected App Router mode with standalone output');
      // For Next.js App Router with standalone output, we need to copy files differently
      await fs$1.copy(path.join(cwd, rendererSrcDir, '.next/standalone'), appDir);
      await fs$1.move(path.join(appDir, '.next/standalone', rendererSrcDir), path.join(appDir));
      await fs$1.copy(path.join(cwd, rendererSrcDir, '.next/static'), path.join(appDir, '.next/static'));
      await fs$1.copy(path.join(cwd, rendererSrcDir, 'public'), path.join(appDir, 'public'));
    } else {
      // Traditional Pages Router approach with export command
      if (await useExportCommand()) {
        await execa('next', ['export', '-o', appDir, path.join(cwd, rendererSrcDir)], execaOptions);
      }
    }
    info('Building main process');
    // 使用tsup替代webpack打包主进程
    // 检查用户项目中是否有tsup.config.ts文件
    const tsupConfigPath = path.join(cwd, 'tsup.config.ts');
    const tsupConfigExists = await fs$1.pathExists(tsupConfigPath);
    if (tsupConfigExists) {
      // 如果用户项目有自定义的tsup配置，使用它
      await execa('tsup', ['--config', tsupConfigPath], _objectSpread(_objectSpread({}, execaOptions), {}, {
        env: _objectSpread(_objectSpread({}, process.env), {}, {
          NODE_ENV: 'production'
        })
      }));
    } else {
      // 如果没有，使用默认参数
      await execa('tsup', ['main/background.ts', 'main/preload.ts', '--format', 'cjs', '--target', 'node16', '--outDir', 'app', '--minify', '--external', 'electron', '--external', 'electron-devtools-installer'], _objectSpread(_objectSpread({}, execaOptions), {}, {
        env: _objectSpread(_objectSpread({}, process.env), {}, {
          NODE_ENV: 'production'
        })
      }));
    }
    if (args['--no-pack']) {
      info('Skip packaging...');
    } else {
      info('Packaging - please wait a moment');
      await execa('electron-builder', createBuilderArgs(), execaOptions);
    }
    info('See `dist` directory');
  } catch (err) {
    console.log(chalk`

{bold.red Cannot build electron packages:}
{bold.yellow ${err}}
`);
    process.exit(1);
  }
})();
function createBuilderArgs() {
  const results = [];
  if (args['--config']) {
    results.push('--config');
    results.push(args['--config'] || 'electron-builder.yml');
  }
  if (args['--publish']) {
    results.push('--publish');
    results.push(args['--publish']);
  }
  args['--mac'] && results.push('--mac');
  args['--linux'] && results.push('--linux');
  args['--win'] && results.push('--win');
  args['--x64'] && results.push('--x64');
  args['--ia32'] && results.push('--ia32');
  args['--armv7l'] && results.push('--armv7l');
  args['--arm64'] && results.push('--arm64');
  args['--universal'] && results.push('--universal');
  return results;
}

// Check if the Next.js project is using App Router with standalone output
async function isUsingAppRouter() {
  try {
    const rendererDir = path.join(cwd, rendererSrcDir);
    const nextConfigPath = path.join(rendererDir, 'next.config.js');
    const nextConfigMjsPath = path.join(rendererDir, 'next.config.mjs');

    // Check if next.config.js or next.config.mjs exists
    const configPath = fs$1.existsSync(nextConfigPath) ? nextConfigPath : fs$1.existsSync(nextConfigMjsPath) ? nextConfigMjsPath : null;
    if (!configPath) return false;

    // Read the config file content
    const configContent = fs$1.readFileSync(configPath, 'utf8');

    // Check if the config has 'output: "standalone"' or 'output: standalone'
    return configContent.includes('output:') && (configContent.includes('"standalone"') || configContent.includes("'standalone'") || configContent.includes('output: standalone'));
  } catch (error) {
    info('Error checking App Router mode: ' + error);
    return false;
  }
}

// For backward compatibility
async function useExportCommand() {
  try {
    return await useExportCommand$1();
  } catch (error) {
    info('Error checking export command: ' + error);
    return true;
  }
}
