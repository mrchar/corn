//! corn-server 库入口
//!
//! 把 bin 内部模块暴露给集成测试使用。生产入口仍由 `main.rs` 调用。

pub mod dto;
pub mod error;
pub mod middleware;
pub mod openapi;
pub mod routes;
pub mod state;
