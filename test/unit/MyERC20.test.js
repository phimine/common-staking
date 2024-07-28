const { getNamedAccounts, deployments, ethers, upgrades } = require("hardhat");
const { assert, expect } = require("chai");

const TOKEN_NAME = "MY ERC20 TOKEN";
const TOKEN_SYMBOL = "MYET";
const INITIAL_SUPPLY = ethers.parseUnits("1000", 18);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MINT_AMOUNT = 1000n;
describe("MyERC20", async function () {
    let myERC20;
    let userA;
    let deployer;

    beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        [, userA] = await ethers.getSigners();

        const token = await ethers.getContractFactory("MyERC20");
        const args = [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY];
        myERC20 = await upgrades.deployProxy(token, args, {
            initializer: "initialize",
        });
    });

    describe("initialize", async function () {
        it("should set name correctly", async function () {
            const response = await myERC20.name();
            assert.equal(response, TOKEN_NAME);
        });

        it("should set symbol correctly", async function () {
            const response = await myERC20.symbol();
            assert.equal(response, TOKEN_SYMBOL);
        });

        it("should set initial supply correctly", async function () {
            const response = await myERC20.totalSupply();
            assert.equal(response, INITIAL_SUPPLY);
        });
    });

    describe("mint", async function () {
        it("should revert with error if not owner", async function () {
            await expect(
                myERC20.connect(userA).mint(userA, MINT_AMOUNT),
            ).to.revertedWithCustomError(myERC20, "OwnableUnauthorizedAccount");
        });

        it("should revert with error if to address is invalid", async function () {
            await expect(
                myERC20.mint(ZERO_ADDRESS, MINT_AMOUNT),
            ).to.revertedWithCustomError(myERC20, "ERC20InvalidReceiver");
        });

        it("should increase balance", async function () {
            const balanceOfUserA = await myERC20.balanceOf(userA);
            await myERC20.mint(userA, MINT_AMOUNT);
            const updatedOfUserA = await myERC20.balanceOf(userA);
            assert.equal(updatedOfUserA, balanceOfUserA + MINT_AMOUNT);
        });

        it("should increase total supply", async function () {
            const totalSupplyBefore = await myERC20.totalSupply();
            await myERC20.mint(userA, MINT_AMOUNT);
            const totalSupplyAfter = await myERC20.totalSupply();
            assert.equal(totalSupplyAfter, totalSupplyBefore + MINT_AMOUNT);
        });
    });
});
