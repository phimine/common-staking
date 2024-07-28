const {
    startBlock,
    endBlock,
    rewardPerBlock,
} = require("../helper-hardhat-config");

module.exports = async ({
    getNamedAccounts,
    deployments,
    ethers,
    upgrades,
    network,
}) => {
    const { deployer } = await getNamedAccounts();
    const { log } = deployments;
    const contractName = "B2Stake";

    const b2Stake = await ethers.getContractFactory(contractName);
    const tokenAddress = (await deployments.get("MyERC20")).address;
    const args = [tokenAddress, startBlock, endBlock, rewardPerBlock];
    const contract = await upgrades.deployProxy(b2Stake, args, {
        initializer: "initialize",
    });
    await contract.waitForDeployment();

    await deployments.save(contractName, {
        address: contract.target,
        abi: JSON.stringify(contract.interface),
    });
    log("current block number is ", await ethers.provider.getBlockNumber());
    log("B2Stake deployed to ", contract.target);
};

module.exports.tags = ["all", "b2stake"];
