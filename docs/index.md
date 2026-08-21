---
layout: home

hero:
  name: 玉米 CORN
  text: 简易通用资源管理系统
  tagline: 预算 · 配额 · 消耗 —— 在任意活动中对资源进行计划、分配与追踪
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/intro
    - theme: alt
      text: 设计文档
      link: /design

features:
  - title: 统一逻辑内核
    details: 业务逻辑集中于 corn-core crate，SaaS、私有化、本地独立运行三种部署形态共享同一份 Rust 代码。
  - title: 契约驱动
    details: utoipa 自动产出 OpenAPI 3.1 规范，前端 SDK 由 openapi-generator 自动生成，多端复用同一类型。
  - title: 多端入口
    details: Web（Next.js）、移动（React Native）、桌面与本地独立运行（Tauri）共用一套前端 SDK。
  - title: 多部署形态
    details: 同一内核既可作为 SaaS 多租户服务运行，也可作为单文件 Tauri 应用本地独立运行。
  - title: 预算配额主轴
    details: 以「预算 → 配额 → 消耗记录」为核心模型，自然支持活动层级与资源类别管理。
  - title: 自动记录
    details: 通过 Recorder 自动按规则记录资源消耗，无需人工录入。
---
