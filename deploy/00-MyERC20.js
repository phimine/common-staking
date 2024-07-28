const { devChains } = require("../helper-hardhat-config");

module.exports = async ({
    getNamedAccounts,
    deployments,
    ethers,
    upgrades,
    network,
}) => {
    const CONTRACT_NAME = "MyERC20";
    console.log(`Deploying ${CONTRACT_NAME} contract...`);
    const { log } = deployments;
    const { deployer } = await getNamedAccounts();
    const [, userA, userB, userC, userD, userE, userF, userG] =
        await ethers.getSigners();
    const chainId = network.config.chainId;
    console.log(
        `${deployer} is deploying contract on network chainId ${chainId}`,
    );

    if (devChains.includes(network.name)) {
        const args = ["My ERC20 Token", "MYET", ethers.parseUnits("1000", 18)];
        const MyERC20 = await ethers.getContractFactory(CONTRACT_NAME);
        const token = await upgrades.deployProxy(MyERC20, args, {
            initializer: "initialize",
        });
        await token.waitForDeployment();
        await deployments.save(CONTRACT_NAME, {
            address: token.target,
            abi: JSON.stringify(token.interface),
        });
        log("block number is ", await ethers.provider.getBlockNumber());
        log("MyERC20 deployed to: ", token.target);
        log("MyERC20.symbol: ", await token.symbol());
        log("MyERC20.totalSupply: ", await token.totalSupply());
        await token.mint(userA, 1000n);
        await token.mint(userB, 1000n);
        await token.mint(userC, 1000n);
        await token.mint(userD, 1000n);
        await token.mint(userE, 1000n);
        await token.mint(userF, 1000n);
        await token.mint(userG, 1000n);
        log("MyERC20.balanceOf(userA): ", await token.balanceOf(userA));
        log("MyERC20.totalSupply: ", await token.totalSupply());
    }
};

module.exports.tags = ["all", "erc20"];
