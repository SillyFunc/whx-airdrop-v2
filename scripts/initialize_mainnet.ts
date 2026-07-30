import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// =============================================================================
// ⚙️ 正式网 (Mainnet-Beta) 初始化参数配置区 (按需填入主网真实地址)
// =============================================================================
const MAINNET_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=a2e06fa2-a3ad-4fe2-937c-057725a623c9";

// 1. 正式网 WHX 代币 Mint 地址 (填入您在主网发行的 WHX 币种 Pubkey)
const MAINNET_WHX_MINT = new PublicKey("CfQChdS5RgUd9FJwg5cYDh56MWWrMKvGuvKDaQg4VFUy");

// 2. 正式网存放 WHX 空投筹码的 Vault 代币账户 (owner 属于 GlobalConfig PDA)
const MAINNET_WHX_VAULT = new PublicKey("DLPJGRH7hL7sCgaSyPKjk92kohjFKo5cyRHiBB4hx4q");

// 3. 正式网 Meteora DLMM 平台上的 WHX/USDT 交易池地址 (LbPair Pubkey)
const MAINNET_LB_PAIR = new PublicKey("6nDd6Y4SEpURbzArtg3GffL2Ltw16FD2SMKfyUnX7SXf");

async function main() {
  console.log("=========================================================================");
  console.log("🚀 发起 Solana Mainnet-Beta (正式网) WHX Airdrop 合约 initialize 初始化");
  console.log("=========================================================================");

  // 1. 读取本地部署者/管理员钱包 (~/.config/solana/id.json)
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
  const adminKeypair = Keypair.fromSecretKey(secretKey);

  console.log(`· 管理员 (Admin) 钱包公钥: ${adminKeypair.publicKey.toBase58()}`);

  // 2. 建立极速 Helius 主网 RPC 连接与 Provider
  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // 3. 记载 Program 实例
  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;
  console.log(`· 目标 Program ID: ${program.programId.toBase58()}`);

  // 4. 派生链上 GlobalConfig PDA 地址 [b"global_config"]
  const [globalConfigPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );
  console.log(`· 派生的 GlobalConfig PDA 地址: ${globalConfigPda.toBase58()}`);

  console.log("\n-------------------------------------------------------------------------");
  console.log("正在向 Solana 正式网发送 initialize 交易...");

  // 5. 调用 initialize 指令
  const txSignature = await program.methods
    .initialize()
    .accountsPartial({
      admin: adminKeypair.publicKey,
      whxMint: MAINNET_WHX_MINT,
      whxVault: MAINNET_WHX_VAULT,
      lbPair: MAINNET_LB_PAIR,
      globalConfig: globalConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();

  console.log("=========================================================================");
  console.log("🎉 正式网 initialize 初始化成功！");
  console.log("=========================================================================");
  console.log(`· 交易签名 (Tx Signature): ${txSignature}`);
  console.log(`· Solscan 查看链接: https://solscan.io/tx/${txSignature}`);
  console.log(`· 初始预算上限: 33,000 USDT (33,000,000,000 Raw Units)`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
