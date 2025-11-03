# AGENTS.md - AI 代理项目指南

## 项目概述

**pg-embedded** 是一个用于 Node.js 的嵌入式 PostgreSQL 数据库库，提供简单易用的 API 来启动、管理和与 PostgreSQL 实例交互。

### 核心特性
- 🚀 快速启动和初始化
- ⚡ 完整的异步/await 支持
- 🛡️ TypeScript 类型安全
- 🧹 自动资源管理和清理
- 🔧 丰富的配置选项
- 🏗️ 跨平台支持（macOS, Linux, Windows）
- 🛠️ 内置 PostgreSQL 工具集成

## 技术栈

### 核心技术
- **Rust**: 高性能后端实现
- **NAPI-RS**: Rust 与 Node.js 的桥接层
- **PostgreSQL**: 嵌入式数据库引擎
- **TypeScript**: 类型定义和示例

### 依赖关系
```toml
[dependencies]
napi = "3.2.4"
postgresql_embedded = "0.20.0"
postgresql_commands = "0.20.0"
tokio = "1.0"
uuid = "1.0"
```

## 架构设计

### 模块结构

```
src/
├── lib.rs              # 模块导出入口
├── postgres.rs         # PostgreSQL 实例管理（核心）
├── state.rs            # 状态管理器（新增）
├── error.rs            # 错误处理
├── types.rs            # 类型定义
├── settings.rs         # 配置管理
├── logger.rs           # 日志系统
├── version.rs          # 版本管理
└── tools/              # PostgreSQL 工具集
    ├── mod.rs
    ├── manager.rs      # 工具管理器（新增）
    ├── common.rs
    ├── pg_dump.rs
    ├── pg_restore.rs
    ├── pg_basebackup.rs
    ├── pg_rewind.rs
    ├── pg_dumpall.rs
    ├── psql.rs
    └── pg_isready.rs
```

### 核心组件

#### 1. PostgresInstance (src/postgres.rs)
**职责**: PostgreSQL 实例生命周期管理

**关键方法**:
- `new()`: 创建实例
- `setup()`: 初始化 PostgreSQL
- `start()`: 启动服务器
- `stop()`: 停止服务器
- `cleanup()`: 清理资源
- `create_database()`: 创建数据库
- `drop_database()`: 删除数据库
- `database_exists()`: 检查数据库是否存在

**设计原则**:
- 使用 `InstanceStateManager` 管理状态
- 使用 `ToolManager` 执行工具操作
- 遵循 SRP（单一职责原则）

#### 2. InstanceStateManager (src/state.rs)
**职责**: 简化的状态管理

**功能**:
- 状态跟踪（Stopped, Starting, Running, Stopping）
- 启动时间记录
- 状态转换验证
- 线程安全的状态访问

**设计原则**:
- KISS：单一结构替代多个 Arc<Mutex<>>
- 完整的单元测试覆盖

#### 3. ToolManager (src/tools/manager.rs)
**职责**: 统一的 PostgreSQL 工具管理

**支持的工具**:
- `pg_dump`: 数据库备份
- `pg_restore`: 数据库恢复
- `pg_basebackup`: 基础备份
- `pg_rewind`: 集群同步
- `pg_dumpall`: 集群备份
- `psql`: SQL 执行

**设计原则**:
- DRY：消除重复的连接配置代码
- OCP：添加新工具无需修改核心类
- 跨平台兼容性注释

## 开发指南

### 构建项目

```bash
# 安装依赖
pnpm install

# 构建 Rust 代码
pnpm build

# 调试构建
pnpm build:debug

# 构建所有平台
pnpm build:all
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 单元测试（快速）
pnpm test:unit

# 集成测试
pnpm test:integration

# 性能测试
pnpm test:performance

# CI 测试（单元 + 集成）
pnpm test:ci

# 运行所有测试（包括性能）
pnpm test:all
```

### 代码质量

```bash
# 格式化代码
pnpm format

# 运行 linter
pnpm lint

# 修复 lint 问题
pnpm lint:fix

# 完整检查
pnpm check
```

## 编程原则

本项目严格遵循以下原则：

### 1. KISS（Keep It Simple, Stupid）
- 追求代码和设计的极致简洁
- 避免不必要的复杂性
- 示例：`InstanceStateManager` 替代 3 个独立的 Arc<Mutex<>>

### 2. YAGNI（You Aren't Gonna Need It）
- 只实现当前明确所需的功能
- 抵制过度设计
- 示例：JavaScript 自动清理变为可选功能

### 3. DRY（Don't Repeat Yourself）
- 识别并消除代码重复
- 提升复用性
- 示例：`ToolManager` 消除 8 处重复代码

### 4. SOLID 原则

#### S - 单一职责原则 (SRP)
- 每个组件只承担一项明确职责
- `PostgresInstance`: 实例管理
- `ToolManager`: 工具执行
- `InstanceStateManager`: 状态管理

#### O - 开放/封闭原则 (OCP)
- 功能扩展无需修改现有代码
- 添加新工具只需扩展 `ToolManager`

#### L - 里氏替换原则 (LSP)
- 子类型可无缝替换基类型
- 保持 API 向后兼容

#### I - 接口隔离原则 (ISP)
- 接口应专一，避免"胖接口"
- 每个工具有独立的配置接口

#### D - 依赖倒置原则 (DIP)
- 依赖抽象而非具体实现
- `PostgresInstance` 依赖 `ToolManager` 抽象

## 跨平台注意事项

### 支持的平台
- macOS (x64, ARM64)
- Linux (x64, ARM64, ARMv7)
- Windows (x64)
- Android (ARM64, ARMv7)

### 平台特定配置

#### Windows
```rust
#[cfg(target_os = "windows")]
{
    settings.timeout = Some(Duration::from_secs(300)); // 5分钟
}
```

#### Unix/Linux/macOS
```rust
#[cfg(not(target_os = "windows"))]
{
    settings.timeout = Some(Duration::from_secs(30)); // 30秒
}
```

### 路径处理
- 使用 `PathBuf` 处理路径
- 自动处理 Unix (/) 和 Windows (\) 分隔符
- 示例：`format!("{}/bin", program_dir)` 在所有平台上工作

## 常见任务

### 添加新的 PostgreSQL 工具

1. 在 `src/tools/` 创建新文件（如 `pg_newtool.rs`）
2. 实现工具配置和执行逻辑
3. 在 `src/tools/manager.rs` 添加方法：
```rust
pub async fn new_tool(
    &self,
    config: PgNewToolConfig,
    database_name: Option<String>,
) -> Result<ToolResult> {
    let conn_config = self.prepare_connection(database_name);
    let tool = PgNewToolTool::from_connection(conn_config, self.bin_dir(), config);
    tool.execute().await
}
```
4. 在 `src/postgres.rs` 添加公共 API：
```rust
#[napi]
pub async unsafe fn create_new_tool(
    &mut self,
    options: PgNewToolConfig,
    database_name: Option<String>,
) -> napi::Result<ToolResult> {
    self.ensure_running()?;
    self.tool_manager()?
        .new_tool(options, database_name)
        .await
        .map_err(Into::into)
}
```

### 修改状态管理

状态管理集中在 `InstanceStateManager`：

```rust
// 获取状态
let state = state_manager.get_state();

// 设置状态
state_manager.set_state(InstanceState::Running);

// 记录启动时间
state_manager.record_startup(duration);

// 验证状态转换
state_manager.validate_transition(target_state)?;
```

### 错误处理

使用统一的错误类型：

```rust
use crate::error::{PgEmbedError, Result};

// 返回错误
return Err(PgEmbedError::DatabaseError("message".to_string()));

// 转换错误
.map_err(|e| PgEmbedError::InternalError(e.to_string()))
```

## 测试策略

### 测试架构（遵循 KISS, DRY, SOLID）

```
__test__/
├── helpers/           # 共享测试工具（DRY）
│   ├── test-config.ts       # 跨平台配置
│   ├── test-instance.ts     # 实例管理
│   └── test-assertions.ts   # 通用断言
├── unit/              # 单元测试（快速、隔离）
├── integration/       # 集成测试（完整工作流）
└── performance/       # 性能测试（可选运行）
```

### 单元测试
- 位于 `__test__/unit/` 目录
- 快速、无副作用、测试单一功能
- 不启动真实数据库
- 运行命令：`pnpm test:unit`

### 集成测试
- 位于 `__test__/integration/` 目录
- 测试完整的工作流程
- 包括生命周期、数据库操作、工具集成、并发安全
- 运行命令：`pnpm test:integration`

### 性能测试
- 位于 `__test__/performance/` 目录
- 测试启动时间、操作吞吐量
- 独立运行，不影响 CI 速度
- 运行命令：`pnpm test:performance`

### 跨平台测试
- 统一的平台配置管理（`test-config.ts`）
- Windows: 更长的超时时间（180s vs 60s）
- 智能重试机制处理平台特定问题
- CI 支持：macOS (x64, ARM64), Windows (x64), Linux (gnu, musl)

## 发布流程

### 版本管理

版本格式：`<base-version>+pg<postgresql-version>`
- 示例：`0.2.3+pg18.0`
- Base version: `0.2.3`
- PostgreSQL version: `18.0`

### 发布命令

```bash
# Patch 版本
pnpm release:patch

# Minor 版本
pnpm release:minor

# Major 版本
pnpm release:major

# 验证发布
pnpm validate

# 干运行
pnpm release:publish:dry
```

## 调试技巧

### 启用调试日志

```typescript
import { initLogger, LogLevel } from 'pg-embedded'

initLogger(LogLevel.Debug)
```

### Rust 调试

```bash
# 使用调试构建
pnpm build:debug

# 查看详细输出
RUST_LOG=debug pnpm test
```

### 性能分析

```bash
# 运行性能基准测试
pnpm bench

# 检查启动时间
pnpm test:startup
```

## 贡献指南

### 代码风格

- Rust: 遵循 `rustfmt` 和 `clippy` 规则
- JavaScript/TypeScript: 遵循 Prettier 配置
- 提交信息: 遵循 Conventional Commits

### Pull Request 流程

1. Fork 项目
2. 创建功能分支
3. 编写测试
4. 确保所有测试通过
5. 提交 PR

### 代码审查重点

- 是否遵循 KISS, YAGNI, DRY, SOLID 原则
- 是否有足够的测试覆盖
- 是否保持向后兼容
- 是否有跨平台兼容性问题
- 是否有性能影响

## 资源链接

- [GitHub Repository](https://github.com/PgTsLabs/pg-embedded)
- [NPM Package](https://npmjs.com/package/pg-embedded)
- [API Documentation](API.md)
- [Changelog](CHANGELOG.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Refactoring Summary](REFACTORING_SUMMARY.md)

## 最近更新

### 2025-11-03: 测试架构重构
- ✅ 重构测试结构：unit / integration / performance
- ✅ 创建统一的测试辅助模块（DRY）
- ✅ 实现跨平台配置管理
- ✅ 启用全平台 CI 测试（macOS, Windows, Linux）
- ✅ 减少测试文件 38%，消除重复代码 67%
- ✅ 单元测试全部通过（23 tests）
- 📝 详见 [TEST_REFACTORING_SUMMARY.md](TEST_REFACTORING_SUMMARY.md)

### 2025-11-03: 模块化重构
- ✅ 引入 `ToolManager` 和 `InstanceStateManager`
- ✅ 减少代码重复 67%
- ✅ 简化状态管理
- ✅ 改进 JavaScript 包装层
- ✅ 所有测试通过

---

**维护者**: PgTsLab
**许可证**: Apache-2.0
**最后更新**: 2025-11-03
