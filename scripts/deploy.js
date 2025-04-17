#!/usr/bin/env node

const ghpages = require('gh-pages')
const path = require('path')
const { execSync } = require('child_process')

// 首先运行准备发布目录的脚本
require('./prepare-release')

// 自定义发布选项
const options = {
  branch: 'releases',
  message: 'Deploy to releases branch: [skip ci]',
  // 关键选项: 添加所有文件，不管 .gitignore
  add: true,
  // 完全忽略 .gitignore 文件
  dotfiles: true, // 允许点文件
  // 不保留历史记录
  history: false,
  // 确保所有文件都被包含，即使在 .gitignore 中
  src: ['**/*', 'bin/**/*'],
  // 静默模式
  silent: false,
  // 在添加文件之前的自定义操作
  beforeAdd: function (cb) {
    try {
      const cmd = 'git add --force bin'
      console.log('执行命令:', cmd)
      execSync(cmd, { cwd: path.join(__dirname, '../release-temp') })
      cb()
    } catch (err) {
      console.warn('强制添加 bin 目录时发生错误:', err)
      // 继续执行，不阻止部署
      cb()
    }
  },
}

// 发布目录路径
const distPath = path.join(__dirname, '../release-temp')

// 执行发布
ghpages.publish(distPath, options, (err) => {
  if (err) {
    console.error('部署失败:', err)
    process.exit(1)
  } else {
    console.log('成功部署到 releases 分支!')
  }
})
