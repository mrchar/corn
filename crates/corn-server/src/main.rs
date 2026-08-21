//! corn-server 入口（SaaS / 私有化部署形态）

mod dto;
mod error;
mod middleware;
mod openapi;
mod routes;
mod state;

use std::sync::Arc;

use corn_core::{schema, Services};
use state::{AppState, Config};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,corn=debug,sqlx=warn".into()),
        )
        .init();

    let cfg = Arc::new(Config::from_env());
    tracing::info!(
        addr = %cfg.addr,
        db = %cfg.database_url,
        multi_tenant = cfg.multi_tenant,
        auth = cfg.auth_token.is_some(),
        "启动 corn-server"
    );

    // 1. 连接数据库（PG / SQLite）
    let repo = corn_core::connect(&cfg.database_url).await?;
    // 2. 初始化 schema
    schema::ensure_schema(&repo).await?;
    // 3. 内核服务 + 默认数据
    let services = Services::new(repo);
    services.ensure_defaults(cfg.default_tenant).await?;

    // 4. 组装路由：业务 + Swagger UI
    let st = AppState::new(services, cfg.clone());
    let biz = routes::app(st);
    let swagger = SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", openapi::ApiDoc::openapi());
    let app = biz
        .merge(swagger)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    // 5. 监听
    let listener = tokio::net::TcpListener::bind(&cfg.addr).await?;
    tracing::info!("监听 http://{} （Swagger: /swagger-ui）", cfg.addr);
    axum::serve(listener, app).await?;
    Ok(())
}
