#!/usr/bin/env node

const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')

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
const binDir = path.join(__dirname, '../bin')
const targetBinDir = path.join(releaseDir, 'bin')

// 确保bin目录存在
if (!fs.existsSync(binDir)) {
  console.error('bin 目录不存在，请确保先运行构建')
  process.exit(1)
}

// 读取bin目录下所有文件
const binFiles = fs.readdirSync(binDir)
console.log('bin 目录文件列表:', binFiles)

// 复制所有文件到目标bin目录
binFiles.forEach((file) => {
  const sourcePath = path.join(binDir, file)
  const targetPath = path.join(targetBinDir, file)

  console.log(`复制 ${sourcePath} 到 ${targetPath}`)
  fs.copySync(sourcePath, targetPath)
})

// 创建一个空的 .gitignore 文件来覆盖默认的规则
fs.writeFileSync(
  path.join(releaseDir, '.gitignore'),
  '# 此文件是为了确保 bin 目录不被忽略\n# 刻意留空\n'
)

// 创建一个 .nojekyll 文件，确保 GitHub Pages 不会忽略以点开头的文件
fs.writeFileSync(path.join(releaseDir, '.nojekyll'), '')

// 列出所有准备好的文件
const allFiles = execSync(`find ${releaseDir} -type f | sort`).toString()
console.log('准备发布的文件列表:\n', allFiles)

console.log('Release directory prepared at', releaseDir)
