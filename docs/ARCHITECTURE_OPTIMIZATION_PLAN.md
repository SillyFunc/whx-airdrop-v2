# WHX Airdrop 智能合约架构与安全优化清单 (Architecture & Security Optimization Plan)

本文档记录了基于 `architecture-review` 评估得出的 3 项优化候选点，已按**风险与优先级从高到低排序**，作为后续合约重构与发布的指导依据。

---

## 📋 优化项清单与风险排序

| 排名 | 优化项名称 | 风险等级 | 英文原文 (Original Text) | 简体中文解读 (Chinese Translation) | 建议优化方案 (Optimization Plan) |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | **测试模拟指令暴露**<br>(`set_lb_pair`) | 🔴 **中高**<br>(生产攻击面风险) | `"The set_lb_pair instruction is exposed in the production program binary. While useful for local test mocks, leaving mock account mutation instructions in production builds widens the program attack surface and dilutes domain clarity."` | `set_lb_pair` 测试指令暴露在生产二进制中。虽然在本地模拟有用，但在生产构建中留存数据修改指令会扩大程序潜在攻击面。 | 使用 Feature Flag（如 `#[cfg(feature = "test-sbf")]`）将该指令物理隔离开，仅在本地测试环境编译，生产打包时自动屏蔽。 |
| **2** | **计算引擎与链上逻辑杂糅**<br>(`claim.rs`) | 🟡 **中**<br>(可维护性与测试风险) | `"handle_claim currently mixes Anchor account validation, byte offset decoding, floating-point math, 10^9 scaling, and CPI token transfers into a single function."` | `handle_claim` 将账户校验、字节解码、浮点数算价、$10^9$ 放大乘除及 CPI 代币转账 5 种职责杂糅在单个函数内。 | 抽取纯 Rust 的 `price_math.rs` 计算引擎模块，使逻辑高解耦，并支持 0.01 秒极速原生单元测试。 |
| **3** | **配置微模块碎片化**<br>(`config.rs`) | 🟢 **低**<br>(代码组织与整洁度) | `"initialize.rs and update_config.rs are shallow micro-files (< 35 lines each) that manipulate the exact same GlobalConfig PDA fields."` | `initialize.rs` 和 `update_config.rs` 为浅层微型文件（各自不足 35 行），且操作完全相同的 `GlobalConfig` 字段。 | 将两个微型文件合并为统一的 `config.rs` 领域模块，减少文件分散度，提升代码导航效率。 |

---

## 📌 执行优先级与推进步骤

当开始进行技术优化时，建议按 **1 ➔ 2 ➔ 3** 的顺序逐步推进：

### 1. 隔离测试模拟指令 (`set_lb_pair`)
- **目标**：确保最终部署至 Solana 主网 (Mainnet-Beta) 的合约二进制文件中，不包含任何允许直接改写 Mock 池子数据的逻辑。
- **实施**：在 `Cargo.toml` 中配置 `[features]` 并在指令处理逻辑上加上 `#[cfg(feature = "test-sbf")]` 宏控制。

### 2. 抽取独立的 Meteora DLMM 价格计算引擎 (`price_math.rs`)
- **目标**：实现“链上外壳（Anchor Context）”与“核心计算引擎（Pure Math Engine）”彻底解耦。
- **实施**：创建 `src/price_math.rs` 模块，将 `parse_lb_pair_params`、`calculate_scaled_price` 和 `calculate_whx_amount` 抽象为纯 Rust 静态方法，并配置 `#[cfg(test)] mod tests` 原生单测。

### 3. 整合管理员配置微模块 (`config.rs`)
- **目标**：提高代码库可读性与文件内聚度。
- **实施**：将 `instructions/initialize.rs` 与 `instructions/update_config.rs` 整合至 `instructions/config.rs`。
