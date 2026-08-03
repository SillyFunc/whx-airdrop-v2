import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// =============================================================================
// ⚙️ Solana Mainnet-Beta 管理员批量确权脚本 (单交易 ≤ 10 用户)
// 用法: npx ts-node scripts/batch_authorize_users.ts <batch.json>
// batch.json 格式: [{"user": "<PUBKEY>", "usdt": 100}, ...]  (usdt 为 USDT 小数)
// 示例: npx ts-node scripts/batch_authorize_users.ts ./batch.json
// 注意: 每个用户必须先自行 initUserAllocation 开户；已授权 (usdtAmount > 0)
//       或已 claim 的用户会在预检阶段被拦截，整批中止（不发半批）。
// =============================================================================

const MAINNET_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=a2e06fa2-a3ad-4fe2-937c-057725a623c9";

// 与链上 MAX_BATCH_USERS 保持一致
const MAX_BATCH_USERS = 10;

async function retryAction<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === maxRetries - 1) throw e;
      console.log(`   ⚠️ 网络波动，第 ${i + 1} 次重试中... (${e.message})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("Action failed after retries");
}

interface BatchEntry {
  user: string;
  usdt: number;
}

interface PreparedEntry {
  userPubkey: PublicKey;
  usdtAmountRaw: number;
  allocPda: PublicKey;
}

async function main() {
  const args = process.argv.slice(2);
  const batchFilePath = args[0];

  if (!batchFilePath) {
    console.error("❌ 用法: npx ts-node scripts/batch_authorize_users.ts <batch.json>");
    process.exit(1);
  }
  if (!fs.existsSync(batchFilePath)) {
    console.error(`❌ 找不到批量文件: ${batchFilePath}`);
    process.exit(1);
  }

  let rawEntries: BatchEntry[];
  try {
    rawEntries = JSON.parse(fs.readFileSync(batchFilePath, "utf-8"));
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
      throw new Error("batch.json 必须是包含至少一个条目的数组");
    }
  } catch (e: any) {
    console.error(`❌ 批量文件解析失败: ${e.message}`);
    process.exit(1);
  }

  // 1. 解析并校验每个条目 (无效条目直接中止)
  const parsedEntries: { userPubkey: PublicKey; usdtAmountRaw: number }[] = [];
  const seen = new Set<string>();
  for (const [i, e] of rawEntries.entries()) {
    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(e.user);
    } catch (err) {
      console.error(`❌ 第 ${i + 1} 条: 无效公钥 "${e.user}"`);
      process.exit(1);
    }
    if (seen.has(userPubkey.toBase58())) {
      console.error(`❌ 第 ${i + 1} 条: 重复用户 ${userPubkey.toBase58()}`);
      process.exit(1);
    }
    seen.add(userPubkey.toBase58());

    const usdtNum = Number(e.usdt);
    if (isNaN(usdtNum) || usdtNum <= 0) {
      console.error(`❌ 第 ${i + 1} 条: 无效 USDT 金额 "${e.usdt}" (必须 > 0)`);
      process.exit(1);
    }
    parsedEntries.push({
      userPubkey,
      usdtAmountRaw: Math.floor(usdtNum * 1_000_000), // 6 decimals
    });
  }

  const currentTimeStr = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });

  console.log("\n=========================================================================");
  console.log("🔑 Solana Mainnet-Beta 管理员批量确权工具 (Batch Authorize)");
  console.log("=========================================================================");
  console.log(`⏰ 执行时间       : ${currentTimeStr}`);
  console.log(`📋 批量文件       : ${batchFilePath}`);
  console.log(`👥 本次确权用户数 : ${parsedEntries.length} (每笔交易 ≤ ${MAX_BATCH_USERS} 人)`);

  // 2. 建立 Solana 主网连接 + 加载管理员私钥
  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");

  const adminKeypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(adminKeypairPath)) {
    console.error(`❌ 无法找到管理员密钥文件: ${adminKeypairPath}`);
    process.exit(1);
  }
  const adminSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8"))
  );
  const adminKeypair = Keypair.fromSecretKey(adminSecretKey);
  console.log(`🔐 管理员 Pubkey  : ${adminKeypair.publicKey.toBase58()}`);

  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;
  console.log(`· 合约 Program ID : ${program.programId.toBase58()}`);

  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );

  // 推导每个用户的 allocation PDA
  const entries: PreparedEntry[] = parsedEntries.map((e) => ({
    ...e,
    allocPda: PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), e.userPubkey.toBuffer()],
      program.programId
    )[0],
  }));

  // 3. 逐用户预检 (PDA 存在 / 未 claim / 未授权)，任一违规整批中止
  console.log("\n-------------------------------------------------------------------------");
  console.log("🔍 预检每个用户的 PDA 链上状态...");

  const violations: string[] = [];
  for (const e of entries) {
    const allocAccInfo = await connection.getAccountInfo(e.allocPda);
    if (allocAccInfo === null) {
      violations.push(`${e.userPubkey.toBase58()}: 尚未开户初始化 (需用户先 initUserAllocation)`);
      continue;
    }
    const currentAlloc = await program.account.userAllocation.fetch(e.allocPda);
    if (currentAlloc.claimed) {
      violations.push(`${e.userPubkey.toBase58()}: 已 claim，无法重复确权`);
    } else if (currentAlloc.usdtAmount.toNumber() > 0) {
      violations.push(
        `${e.userPubkey.toBase58()}: 已有配额 ${Number(currentAlloc.usdtAmount) / 1e6} USDT (set-once，不可覆盖)`
      );
    }
  }

  if (violations.length > 0) {
    console.error("\n❌ 预检发现违规条目，整批中止（未发送任何交易）:");
    for (const v of violations) console.error(`   - ${v}`);
    process.exit(1);
  }
  console.log(`   ✅ 全部 ${entries.length} 个用户预检通过`);

  // 4. 按 ≤10 分块提交批量交易
  let successCount = 0;
  let totalRaw = 0;
  const txLinks: string[] = [];

  for (let i = 0; i < entries.length; i += MAX_BATCH_USERS) {
    const chunk = entries.slice(i, i + MAX_BATCH_USERS);
    const users = chunk.map((e) => e.userPubkey);
    const amounts = chunk.map((e) => new anchor.BN(e.usdtAmountRaw));
    const chunkRaw = chunk.reduce((acc, e) => acc + e.usdtAmountRaw, 0);

    console.log("\n-------------------------------------------------------------------------");
    console.log(`🚀 提交第 ${i / MAX_BATCH_USERS + 1} 批 (${chunk.length} 人, ${chunkRaw / 1e6} USDT)...`);

    const tx = await retryAction(async () => {
      return await program.methods
        .batchAuthorizeUsers(users, amounts)
        .accountsPartial({
          admin: adminKeypair.publicKey,
          globalConfig: globalConfigPda,
        })
        .remainingAccounts(
          chunk.map((e) => ({ pubkey: e.allocPda, isSigner: false, isWritable: true }))
        )
        .signers([adminKeypair])
        .rpc();
    });

    successCount += chunk.length;
    totalRaw += chunkRaw;
    txLinks.push(tx);
    console.log(`   ✅ 第 ${i / MAX_BATCH_USERS + 1} 批成功: https://solscan.io/tx/${tx}`);
  }

  // 5. 验证链上写入结果并汇总
  console.log("\n=========================================================================");
  console.log("🎉 批量确权授权 100% 成功！！");
  console.log("=========================================================================");
  console.log(`· 成功授权用户数 : ${successCount} / ${entries.length}`);
  console.log(`· 累计写入额度   : ✨ ${(totalRaw / 1e6).toFixed(6)} USDT ✨`);
  for (const e of entries) {
    const updatedAlloc = await program.account.userAllocation.fetch(e.allocPda);
    console.log(
      `   ├─ ${e.userPubkey.toBase58().slice(0, 12)}...  → ${(Number(updatedAlloc.usdtAmount) / 1e6).toFixed(6)} USDT`
    );
  }
  for (const tx of txLinks) {
    console.log(`· 链上交易 Solscan : https://solscan.io/tx/${tx}`);
  }
  console.log("=========================================================================\n");
}

main().catch(console.error);
