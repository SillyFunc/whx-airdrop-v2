import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// =============================================================================
// ⚙️ 按用户期望顺序执行: 创建 ATA -> 创建 PDA -> 管理员授权 -> 用户 Claim
// =============================================================================
const MAINNET_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=a2e06fa2-a3ad-4fe2-937c-057725a623c9";

const SPECIFIC_TARGET_USER_PUBKEY = new PublicKey(
  "7Eq5NH7Tc4UvXGieL3ZkJA8Mp7e3k4GaCbzipCuoJUhB"
);

const TEST_USDT_AMOUNT_RAW = 1_000_000; // 1.00 USDT

const WHX_MINT_PUBKEY = new PublicKey(
  "CfQChdS5RgUd9FJwg5cYDh56MWWrMKvGuvKDaQg4VFUy"
);
const WHX_VAULT_PUBKEY = new PublicKey(
  "75nBb11tKBDKWFTXiwfLCnTbioptuXVjrn4Ta52Cyvkt"
);

// 链上 Meteora 官方流动性池 (Meteora CPMM Pool / 6nDd...)
const METEORA_POOL_PUBKEY = new PublicKey(
  "6nDd6Y4SEpURbzArtg3GffL2Ltw16FD2SMKfyUnX7SXf"
);
const WHX_POOL_RESERVE_VAULT = new PublicKey(
  "DLPJGRH7hL7sCgaSyPKjk92kohjFKo5cyRHiBB4hx4q"
);
const USDT_POOL_RESERVE_VAULT = new PublicKey(
  "AeUHUkEgMm1VgkDaC6iDMQgguVJoAr4ed5qfFVv2yHvu"
);

async function getAccountWithRetry(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  maxRetries = 5
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getAccount(connection, pubkey);
    } catch (e: any) {
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Failed to fetch account after retries");
}

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

async function main() {
  const currentTimeStr = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });

  console.log("\n=========================================================================");
  console.log("🚀 按预期顺序演练: 创建ATA -> 创建PDA -> 管理员授权 -> 用户Claim");
  console.log("=========================================================================");
  console.log(`⏰ 当前执行时间: ${currentTimeStr}`);

  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");

  // 1. 加载管理员与测试目标用户
  const adminKeypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const adminSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8"))
  );
  const adminKeypair = Keypair.fromSecretKey(adminSecretKey);
  const testUserKeypair = Keypair.generate();

  console.log("\n-------------------------------------------------------------------------");
  console.log("🔑 账户信息:");
  console.log(`  ├─ 管理员 (Admin) 地址 : ${adminKeypair.publicKey.toBase58()}`);
  console.log(`  ├─ 充值目标用户 地址   : ${SPECIFIC_TARGET_USER_PUBKEY.toBase58()}`);
  console.log(`  ├─ 测试提领用户 地址   : ${testUserKeypair.publicKey.toBase58()}`);
  console.log(`  └─ 本次确权测试额度   : 1.00 USDT (${TEST_USDT_AMOUNT_RAW} Raw Units)`);

  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;

  // 为测试用户注入 Gas SOL
  await retryAction(async () => {
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: testUserKeypair.publicKey,
        lamports: 5_000_000,
      })
    );
    await provider.sendAndConfirm(fundTx, [adminKeypair]);
  });

  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );
  const [testUserAllocPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_allocation"), testUserKeypair.publicKey.toBuffer()],
    program.programId
  );

  // =============================================================================
  // 步骤 1/4: 创建 ATA (如果不存在)
  // =============================================================================
  console.log("\n-------------------------------------------------------------------------");
  console.log("💳 步骤 1/4: 创建用户的 WHX ATA 代币账户 (如果不存在)...");
  const userWhxAta = getAssociatedTokenAddressSync(
    WHX_MINT_PUBKEY,
    testUserKeypair.publicKey
  );
  const createAtaTx = await retryAction(async () => {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      testUserKeypair.publicKey,
      userWhxAta,
      testUserKeypair.publicKey,
      WHX_MINT_PUBKEY
    );
    const tx = new Transaction().add(createAtaIx);
    const userProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(testUserKeypair),
      { commitment: "confirmed" }
    );
    return await userProvider.sendAndConfirm(tx, [testUserKeypair]);
  });
  console.log(`   ✨ 成功创建用户 WHX ATA 账户!`);
  console.log(`   └─ ATA 地址: ${userWhxAta.toBase58()}`);
  console.log(`   └─ Solscan Tx: https://solscan.io/tx/${createAtaTx}`);

  // =============================================================================
  // 步骤 2/4: 创建 PDA (如果不存在)
  // =============================================================================
  console.log("\n-------------------------------------------------------------------------");
  console.log("📝 步骤 2/4: 创建用户 UserAllocation PDA (如果不存在)...");
  const initAllocTx = await retryAction(async () => {
    return await program.methods
      .initUserAllocation()
      .accountsPartial({
        user: testUserKeypair.publicKey,
        userAllocation: testUserAllocPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([testUserKeypair])
      .rpc();
  });
  console.log(`   ✨ 成功创建 UserAllocation PDA!`);
  console.log(`   └─ PDA 地址: ${testUserAllocPda.toBase58()}`);
  console.log(`   └─ Solscan Tx: https://solscan.io/tx/${initAllocTx}`);

  // =============================================================================
  // 步骤 3/4: 管理员授权确权 (authorizeUser)
  // =============================================================================
  console.log("\n-------------------------------------------------------------------------");
  console.log("🔑 步骤 3/4: 管理员 authorizeUser 确权写入 1.00 USDT 额度...");
  const authTx = await retryAction(async () => {
    return await program.methods
      .authorizeUser(new anchor.BN(TEST_USDT_AMOUNT_RAW))
      .accountsPartial({
        admin: adminKeypair.publicKey,
        user: testUserKeypair.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: testUserAllocPda,
      })
      .signers([adminKeypair])
      .rpc();
  });
  console.log(`   ✨ 确权成功！写入 1.00 USDT 额度。`);
  console.log(`   └─ Solscan Tx: https://solscan.io/tx/${authTx}`);

  // =============================================================================
  // 步骤 4/4: 用户 Claim 提取代币
  // =============================================================================
  console.log("\n-------------------------------------------------------------------------");
  console.log("✨ 步骤 4/4: 用户发起 claim 指令提取 WHX 空投...");
  const claimTx = await retryAction(async () => {
    return await program.methods
      .claim()
      .accountsPartial({
        user: testUserKeypair.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: testUserAllocPda,
        whxVault: WHX_VAULT_PUBKEY,
        lbPair: METEORA_POOL_PUBKEY,
        userWhxAccount: userWhxAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([testUserKeypair])
      .rpc();
  });

  const finalWhxBalance = await getAccountWithRetry(connection, userWhxAta);
  const rawAmount = Number(finalWhxBalance.amount);
  const formattedWhx = (rawAmount / 1_000_000).toFixed(6);

  console.log("\n=========================================================================");
  console.log("🎉 按预期顺序（创建ATA -> 创建PDA -> 管理员授权）实测 100% 成功！！");
  console.log("=========================================================================");
  console.log(`· 链上实际到账 WHX 数量: ✨ ${formattedWhx} WHX ✨ (Raw Units: ${rawAmount})`);
  console.log(`· Solscan 领币交易签名 : https://solscan.io/tx/${claimTx}`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
