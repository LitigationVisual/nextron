#!/usr/bin/env node

const fs = require('fs-extra')
const path = require('path')

// 定义发布目录
const releaseDir = path.join(__dirname, '../release-temp')

// 清理发布目录
fs.removeSync(releaseDir)
fs.ensureDirSync(releaseDir)
fs.ensureDirSync(path.join(releaseDir, 'bin'))

// 复制必要的文件
const filesToCopy = ['LICENSE', 'README.md', 'babel.js', 'package.json']

filesToCopy.forEach((file) => {
  fs.copySync(path.join(__dirname, '..', file), path.join(releaseDir, file))
})

// 复制bin目录内容
fs.copySync(path.join(__dirname, '../bin'), path.join(releaseDir, 'bin'))

console.log('Release directory prepared at', releaseDir)
