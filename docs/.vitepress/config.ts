import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '玉米 CORN',
  description: '简易通用资源管理系统',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/intro' },
      { text: '设计', link: '/design' },
      { text: '需求', link: '/requirements' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '玉米是什么', link: '/guide/intro' },
            { text: '核心概念', link: '/guide/concepts' },
            { text: '架构总览', link: '/guide/architecture' }
          ]
        }
      ],
      '/': [
        {
          text: '文档',
          items: [
            { text: '需求文档', link: '/requirements' },
            { text: '设计文档', link: '/design' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mrchar/corn' }
    ],
    footer: {
      message: '基于 Rust + Tauri + React',
      copyright: 'Copyright © 玉米 CORN'
    },
    search: {
      provider: 'local'
    }
  }
})
