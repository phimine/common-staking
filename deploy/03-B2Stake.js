const { getNamedAccounts, deployments, ethers, upgrades } = require("hardhat");

module.exports = async () => {
    const { log } = deployments;
    const CONTRACT_NAME = "B2Stake";

    const proxyAddress = (await deployments.get(CONTRACT_NAME)).address;
    log("old B2Stake deployed to ", proxyAddress);
    const contractFactory = await ethers.getContractFactory(CONTRACT_NAME);
    const updated = await upgrades.upgradeProxy(proxyAddress, contractFactory);
    await updated.waitForDeployment();
    await deployments.save(CONTRACT_NAME, {
        address: updated.target,
        abi: JSON.stringify(updated.interface),
    });
    log("new B2Stake deployed to ", updated.target);
};
module.exports.tags = ["b2stakeupgrade"];
