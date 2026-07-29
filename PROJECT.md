---

**Role:** 
你是一名顶尖的 Solana 智能合约架构师与安全审计专家。你不仅精通 Anchor 框架，还对 DeFi 安全漏洞（如闪电贷攻击、精度损失、账户伪造）有极深刻的理解。

**Project:** 
开发一个名为 `whx_airdrop` 的空投程序。空投总池为价值 33,000 USDT 的 WHX 代币。

#### 1. 业务逻辑 (Business Logic)
1. **确权逻辑**：管理员在后台审核用户资格（加群+算力）。审核通过后，管理员调用 `authorize_user` 将用户的 **USDT 分配额度** 写入链上 PDA。租金由管理员支付。
2. **价格逻辑**：用户领取时，合约需实时读取指定的 Raydium 池子（WHX-USDT）的两个代币账户余额，通过比例计算实时价格。
3. **领取逻辑**：用户调用 `claim`。合约根据“链上 U 额度”和“实时价格”计算 WHX 数量，转账给用户，并立即**销毁该 PDA 账户以回收租金给管理员**。

#### 2. 技术规格 (Technical Specs)
- **Framework**: Anchor 1.1.2 或更高版本。
- **Accounts**:
    - `GlobalConfig`: 存储 `admin`, `whx_mint`, `whx_vault`, `pool_whx_vault`, `pool_usdt_vault`, `min_price`, `max_price`。
    - `UserAllocation`: PDA (seeds: `[b"user_allocation", user_pubkey]`)，存储 `usdt_amount` (u64)。
- **Instructions**:
    - `initialize`: 初始化全局配置。
    - `update_config`: 管理员修改配置（池子地址、价格区间、金库等）。
    - `authorize_user`: 管理员为用户写入 U 额度。
    - `claim`: 用户领取、价格校验、数学换算、转账、关闭账户回收租金。
    - `emergency_withdraw`: 管理员提取余量。

#### 3. 安全审计要求 (Security & Self-Audit)
请在代码中实现以下生产级安全防御：
- **账户校验 (Account Integrity)**：在 `claim` 函数中，必须严格校验传入的池子金库地址是否与 `GlobalConfig` 记录的一致。
- **数学安全 (Math Safety)**：全程使用 `checked_mul` 和 `checked_div`。中间计算提升至 `u128`。
- **计算顺序**：坚持“先乘后除”原则，确保精度损失最小。
- **防操纵 (Price Guard)**：强制校验实时价格是否处于 `[min_price, max_price]` 范围内。
- **防重放 (Replay Protection)**：领取后账户必须 Close，防止重复领取。
- **权限隔离**：所有管理接口必须有 `signer = admin` 约束。

#### 4. 自动化测试要求 (Testing)
请使用 TypeScript 为此合约编写完整的集成测试脚本 (`tests/whx_airdrop.ts`)：
- **场景一：完整正向流程**。模拟池子余额 -> 管理员授权 -> 用户领取 -> 校验用户余额增加且管理员收到租金退回。
- **场景二：权限攻击**。非 Admin 尝试授权或修改配置，应报错。
- **场景三：价格操纵防御**。模拟池子余额异常导致价格超出 `max_price`，验证 `claim` 被拦截。
- **场景四：伪造账户攻击**。传入错误的池子金库地址，验证合约抛出 `InvalidPoolAccount`。
- **场景五：重复领取测试**。验证用户领完后第二次调用会报错。

#### 5. 交付内容 (Deliverables)
1. **`lib.rs`**: 完整、带有详尽注释的 Rust 代码。
2. **`errors.rs`**: 清晰的自定义错误枚举。
3. **`whx_airdrop.ts`**: 覆盖上述场景的测试代码。
4. **安全审计报告**: 简要说明代码中针对闪电贷操纵和精度问题的具体处理。

#### 6. 补充
1.  **关于池子地址**：
    *   Pool ID: `6nDd6Y4SEpURbzArtg3GffL2Ltw16FD2SMKfyUnX7SXf`
    *   WHX Vault: `DLPJGRH7hL7sCgaSyPKjk92kohjFKo5cyRHiBB4hx4q`
    *   USDT Vault: `AeUHUkEgMm1VgkDaC6iDMQgguVJoAr4ed5qfFVv2yHvu`
2.  **关于精度**：请再次确认 WHX 是 6 位，USDT 是 6 位。
3.  **运行环境**：拿到代码后，记得运行 `anchor test`。如果测试脚本里的“价格异常”用例没过，说明池子余额不够夸张，稍微调大点余额数值即可。
---
