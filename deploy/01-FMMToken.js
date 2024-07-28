const { network } = require("hardhat");
const { devChains } = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");
require("dotenv").config();

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log("Deploying FMMToken contract...");
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    console.log(`deployer is: ${deployer}`);
    const chainId = network.config.chainId;
    console.log(`chainId is: ${chainId}`);

    let FMMToken;
    const args = ["FMMToken", "FMM"];
    if (devChains.includes(network.name)) {
        // 只在dev环境上部署
        FMMToken = await deploy("FMMToken", {
            from: deployer,
            args: args,
            log: true,
        });
        log(`--------FMMToken deployed at ${FMMToken.address}`);
    } else if (process.env.ETHERSCAN_API_KEY) {
        // 测试网或主网 验证合约
        await verify(FMMToken.address, args);
    }
};

module.exports.tags = ["fmm"];
