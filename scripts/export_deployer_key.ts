import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function main() {
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(keypairPath)) {
    console.error(`❌ 未找到部署者密钥文件: ${keypairPath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const secretKey = Uint8Array.from(rawData);

  // Dynamically load bs58 from node_modules
  const bs58 = require("bs58");
  const base58PrivateKey = bs58.encode(secretKey);

  console.log("=========================================================================");
  console.log("🔑 部署者钱包信息 (Deployer Wallet Information)");
  console.log("=========================================================================");
  console.log(`· 钱包文件路径: ${keypairPath}`);
  console.log(`· Base58 格式私钥:`);
  console.log(`\n  ${base58PrivateKey}\n`);
  console.log("-------------------------------------------------------------------------");
  console.log("📋 提示：按住鼠标复制上方那串 Base58 私钥字符串，在 Phantom 钱包中选择");
  console.log("     『添加钱包』 -> 『导入私钥』 粘贴即可！");
  console.log("=========================================================================\n");
}

main().catch(console.error);
