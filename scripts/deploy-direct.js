#!/usr/bin/env node

const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')

// 运行构建
console.log('运行构建...')
execSync('npm run build', { stdio: 'inherit' })

// 首先运行准备发布目录的脚本
require('./prepare-release')

const releaseDir = path.join(__dirname, '../release-temp')
const tmpDir = path.join(__dirname, '../.deploy-tmp')

// 准备临时目录
fs.removeSync(tmpDir)
fs.ensureDirSync(tmpDir)

try {
  // 初始化新的 git 仓库
  console.log('初始化临时 git 仓库...')
  execSync('git init', { cwd: tmpDir })

  // 添加远程仓库
  const remoteUrl = execSync('git remote get-url origin', {
    encoding: 'utf8',
  }).trim()
  console.log(`添加远程仓库: ${remoteUrl}`)
  execSync(`git remote add origin ${remoteUrl}`, { cwd: tmpDir })

  // 复制准备好的发布内容到临时目录
  console.log('复制发布内容到临时目录...')
  fs.copySync(releaseDir, tmpDir)

  // 添加所有文件
  console.log('添加所有文件到 git...')
  execSync('git add -A', { cwd: tmpDir })

  // 配置 git 用户
  execSync('git config user.name "GitHub Actions"', { cwd: tmpDir })
  execSync('git config user.email "actions@github.com"', { cwd: tmpDir })

  // 提交更改
  console.log('提交更改...')
  execSync('git commit -m "Deploy to releases branch [skip ci]"', {
    cwd: tmpDir,
  })

  // 推送到 releases 分支，强制覆盖
  console.log('推送到 releases 分支...')
  execSync('git push -f origin HEAD:releases', { cwd: tmpDir })

  console.log('成功部署到 releases 分支!')
} catch (error) {
  console.error('部署失败:', error.message)
  process.exit(1)
} finally {
  // 清理临时目录
  fs.removeSync(tmpDir)
}
