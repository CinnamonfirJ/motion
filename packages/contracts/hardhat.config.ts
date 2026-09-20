import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load repo-root .env then local .env (local wins).
dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.SETTLER_PRIVATE_KEY;
const MONAD_RPC = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // Monad testnet — chainId 10143. PRD §19 real settlement target.
    monadTestnet: {
      url: MONAD_RPC,
      chainId: 10143,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
};

export default config;
