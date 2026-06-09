require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const deployerPrivateKey = process.env.PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
const deployerAccounts = deployerPrivateKey ? [deployerPrivateKey] : [];
const polygonscanApiKey = process.env.POLYGONSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: deployerAccounts,
      chainId: 11155111,
    },
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC_URL || process.env.AMOY_RPC_URL || "",
      accounts: deployerAccounts,
      chainId: 80002,
    },
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC_URL || process.env.POLYGON_RPC_URL || "",
      accounts: deployerAccounts,
      chainId: 137,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  etherscan: {
    apiKey: {
      polygon: polygonscanApiKey,
      polygonAmoy: polygonscanApiKey,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
