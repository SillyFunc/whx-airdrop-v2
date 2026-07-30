import * as anchor from "@coral-xyz/anchor";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const bs58 = require("bs58");

// =============================================================================
// ⚙️ 向合约专属金库直接充值 WHX 脚本
// =============================================================================
const MAINNET_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=a2e06fa2-a3ad-4fe2-937c-057725a623c9";

// 目标充值金库地址 (PDA Vault ATA)
const CONTRACT_VAULT_ATA = new PublicKey(
  "75nBb11tKBDKWFTXiwfLCnTbioptuXVjrn4Ta52Cyvkt"
);

// 准备充值的 WHX 数量 (例如充值 10.000000 WHX)
const AMOUNT_TO_FUND_FORMATTED = 10;
const AMOUNT_TO_FUND_RAW = AMOUNT_TO_FUND_FORMATTED * 1_000_000;

async function main() {
  console.log("=========================================================================");
  console.log("🚀 开始直接向合约专属金库 (75nBb...) 划拨充值 WHX 代币");
  console.log("=========================================================================");

  // 1. 读取充值付款钱包 (默认使用本地 ~/.config/solana/id.json，或者更换为您有 WHX 的钱包私钥)
  const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(walletPath, "utf-8"))
  );
  const payerKeypair = Keypair.fromSecretKey(secretKey);

  console.log(`· 付款钱包地址: ${payerKeypair.publicKey.toBase58()}`);
  console.log(`· 充值目标金库: ${CONTRACT_VAULT_ATA.toBase58()}`);
  console.log(`· 计划充值数量: ${AMOUNT_TO_FUND_FORMATTED} WHX\n`);

  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");

  // 2. 获取付款钱包的 WHX ATA 账户地址
  const whxMint = new PublicKey("CfQChdS5RgUd9FJwg5cYDh56MWWrMKvGuvKDaQg4VFUy");
  const payerWhxAta = getAssociatedTokenAddressSync(
    whxMint,
    payerKeypair.publicKey
  );
  console.log(`· 付款人 WHX ATA 账户: ${payerWhxAta.toBase58()}`);

  // 3. 构建直接针对合约 ATA 的 SPL Token Transfer 指令 (绕过 Phantom 套壳)
  const transferIx = createTransferInstruction(
    payerWhxAta,        // 资金来源：付款人 ATA
    CONTRACT_VAULT_ATA, // 资金去向：合约金库 ATA
    payerKeypair.publicKey, // 授权签名人
    AMOUNT_TO_FUND_RAW   // 充值数量
  );

  const tx = new Transaction().add(transferIx);
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payerKeypair),
    { commitment: "confirmed" }
  );

  console.log("正在发送充值交易...");
  const txSignature = await provider.sendAndConfirm(tx, [payerKeypair]);

  console.log("=========================================================================");
  console.log("🎉 成功直接向合约金库充值 WHX！");
  console.log("=========================================================================");
  console.log(`· 交易签名 (Tx Signature): ${txSignature}`);
  console.log(`· Solscan 查看链接: https://solscan.io/tx/${txSignature}`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
