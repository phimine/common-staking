const { getNamedAccounts, deployments, ethers } = require("hardhat");
const { assert, expect } = require("chai");

const tokenName = "FMMToken";
const tokenSymbol = "FMM";
const ZERO = "0";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MINT_AMOUNT = 1000n;
const TRANSFER_AMOUNT = 10n;
const APPROVE_AMOUNT = 500n;
describe("FMMToken", async function () {
    let fmmToken;
    let deployer;
    let userA, userB, userC;
    beforeEach(async function () {
        // deploy contract using hardhat-deploy
        const accounts = await getNamedAccounts();
        [, userA, userB, userC] = await ethers.getSigners();
        deployer = accounts.deployer;
        await deployments.fixture("fmm");
        fmmToken = await deployments.get("FMMToken");
        fmmToken = await ethers.getContractAt(fmmToken.abi, fmmToken.address);
    });

    describe("constructor", async function () {
        it("sets the name correctly", async function () {
            const response = await fmmToken.getName();
            assert.equal(response, tokenName);
        });
        it("sets the symbol correctly", async function () {
            const response = await fmmToken.getSymbol();
            assert.equal(response, tokenSymbol);
        });
        it("sets the owner correctly", async function () {
            const response = await fmmToken.getOwner();
            assert.equal(response, deployer);
        });
    });

    describe("getDecimals", async function () {
        it("should return decimals of the contract", async function () {
            const response = await fmmToken.getDecimals();
            const DECIMALS = 18n;
            assert.equal(response, DECIMALS);
        });
    });

    describe("mint", async function () {
        it("should revert with FMMToken__NotOwner error if non-owner", async function () {
            await expect(
                fmmToken.connect(userA).mint(deployer, MINT_AMOUNT),
            ).to.be.revertedWithCustomError(fmmToken, "FMMToken__NotOwner");
        });
        it("should revert with FMMToken__InvalidAddress error if to address is invalid", async function () {
            await expect(
                fmmToken.mint(ZERO_ADDRESS, MINT_AMOUNT),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InvalidAddress",
            );
        });
        it("should revert with FMMToken__InvalidAmount error if mint amount is zero", async function () {
            await expect(
                fmmToken.mint(deployer, ZERO),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InvalidAmount",
            );
        });
        it("should increase balance of to address after minting", async function () {
            const beforeMint = await fmmToken.balanceOf(deployer);
            await fmmToken.mint(deployer, MINT_AMOUNT);
            const afterMint = await fmmToken.balanceOf(deployer);
            assert.equal(afterMint, beforeMint + MINT_AMOUNT);
        });
        it("should increase balance of total supply after minting", async function () {
            const beforeMint = await fmmToken.getTotalSupply();
            await fmmToken.mint(deployer, MINT_AMOUNT);
            const afterMint = await fmmToken.getTotalSupply();
            assert.equal(afterMint, beforeMint + MINT_AMOUNT);
        });
        it("should emit Transfer error with correct args in mint function", async function () {
            await expect(fmmToken.mint(deployer, MINT_AMOUNT))
                .to.be.emit(fmmToken, "Transfer")
                .withArgs(ZERO_ADDRESS, deployer, MINT_AMOUNT);
        });
    });

    describe("burn", async function () {
        const BURN_AMOUNT = 100n;
        let balanceBeforeBurn;
        beforeEach(async function () {
            await fmmToken.mint(deployer, MINT_AMOUNT);
            balanceBeforeBurn = await fmmToken.balanceOf(deployer);
            expect(balanceBeforeBurn).to.be.greaterThanOrEqual(MINT_AMOUNT);
        });
        it("should revert with FMMToken__NotOwner error if non-owner", async function () {
            await expect(
                fmmToken.connect(userA).burn(deployer, MINT_AMOUNT),
            ).to.be.revertedWithCustomError(fmmToken, "FMMToken__NotOwner");
        });
        it("should revert with FMMToken__InvalidAddress error if to address is invalid", async function () {
            await expect(
                fmmToken.burn(ZERO_ADDRESS, MINT_AMOUNT),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InvalidAddress",
            );
        });
        it("should revert with FMMToken__InvalidAmount error if burn amount is zero", async function () {
            await expect(
                fmmToken.burn(deployer, ZERO),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InvalidAmount",
            );
        });
        it("should revert with FMMToken__InsuffienceBalance error if burn amount is greater than balance", async function () {
            const balance = await fmmToken.balanceOf(deployer);
            const largeBurnAmount = balance + 1n;
            await expect(
                fmmToken.burn(deployer, largeBurnAmount),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InsuffienceBalance",
            );
        });
        it("should reduce balance of the account after burning", async function () {
            await fmmToken.burn(deployer, BURN_AMOUNT);
            const balanceAfterBurn = await fmmToken.balanceOf(deployer);
            assert.equal(balanceAfterBurn, balanceBeforeBurn - BURN_AMOUNT);
        });
        it("should reduce total supply after burning", async function () {
            const totalSupplyBeforeBurn = await fmmToken.getTotalSupply();
            await fmmToken.burn(deployer, BURN_AMOUNT);
            const totalSupplyAfterBurn = await fmmToken.getTotalSupply();
            assert.equal(
                totalSupplyAfterBurn,
                totalSupplyBeforeBurn - BURN_AMOUNT,
            );
        });
        it("should emit Transfer event in burn function", async function () {
            await expect(fmmToken.burn(deployer, BURN_AMOUNT))
                .to.emit(fmmToken, "Transfer")
                .withArgs(deployer, ZERO_ADDRESS, BURN_AMOUNT);
        });
    });

    describe("transfer", async function () {
        let balanceOfUserA, balanceOfUserB;
        beforeEach(async function () {
            await fmmToken.mint(userA, MINT_AMOUNT);
            await fmmToken.mint(userB, MINT_AMOUNT);
            balanceOfUserA = await fmmToken.balanceOf(userA.address);
            balanceOfUserB = await fmmToken.balanceOf(userB.address);
            expect(balanceOfUserA).to.greaterThanOrEqual(MINT_AMOUNT);
            expect(balanceOfUserB).to.greaterThanOrEqual(MINT_AMOUNT);
        });
        it("should revert with FMMToken__InsuffienceBalance if balance is not enough", async function () {
            const invalidAmount = balanceOfUserA + 1n;
            await expect(
                fmmToken.connect(userA).transfer(userB, invalidAmount),
            ).to.revertedWithCustomError(
                fmmToken,
                "FMMToken__InsuffienceBalance",
            );
        });
        it("should transfer successfully if everything is correct", async function () {
            await fmmToken.connect(userA).transfer(userB, TRANSFER_AMOUNT);
            const updatedOfUserA = await fmmToken.balanceOf(userA.address);
            const updatedOfUserB = await fmmToken.balanceOf(userB.address);
            assert.equal(updatedOfUserA, balanceOfUserA - TRANSFER_AMOUNT);
            assert.equal(updatedOfUserB, balanceOfUserB + TRANSFER_AMOUNT);
        });
        it("should emit Transfer event", async function () {
            await expect(
                fmmToken.connect(userA).transfer(userB, TRANSFER_AMOUNT),
            )
                .to.emit(fmmToken, "Transfer")
                .withArgs(userA.address, userB.address, TRANSFER_AMOUNT);
        });
    });

    describe("approve", async function () {
        it("should revert with FMMToken__InvalidAddress error if to address is invalid", async function () {
            await expect(
                fmmToken.approve(ZERO_ADDRESS, APPROVE_AMOUNT),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InvalidAddress",
            );
        });
        it("should revert with FMMToken__InvalidAmount error if approve amount is zero", async function () {
            await expect(
                fmmToken.approve(deployer, ZERO),
            ).to.be.revertedWithCustomError(
                fmmToken,
                "FMMToken__InvalidAmount",
            );
        });
        it("should update allowances if approve successfully", async function () {
            const allowanceBeforeApprove = await fmmToken.allowanceOf(
                userA.address,
                userB.address,
            );
            await fmmToken
                .connect(userA)
                .approve(userB.address, APPROVE_AMOUNT);
            const allowanceAfterApprove = await fmmToken.allowanceOf(
                userA.address,
                userB.address,
            );
            assert.equal(
                allowanceAfterApprove,
                allowanceBeforeApprove + APPROVE_AMOUNT,
            );
        });
        it("should emit Approve event", async function () {
            await expect(fmmToken.connect(userA).approve(userB, APPROVE_AMOUNT))
                .to.emit(fmmToken, "Approval")
                .withArgs(userA.address, userB.address, APPROVE_AMOUNT);
        });
    });

    describe("transferFrom", async function () {
        let balanceOfUserA, balanceOfUserB, balanceOfC;
        let balanceOfUserC;
        beforeEach(async function () {
            await fmmToken.mint(userA.address, MINT_AMOUNT);
            await fmmToken.mint(userB.address, MINT_AMOUNT);
            await fmmToken.mint(userC.address, MINT_AMOUNT);
            await fmmToken.connect(userA).approve(userC, APPROVE_AMOUNT);
            balanceOfUserA = await fmmToken.balanceOf(userA.address);
            balanceOfUserB = await fmmToken.balanceOf(userB.address);
            balanceOfUserC = await fmmToken.balanceOf(userC.address);
            allowanceFromAToC = await fmmToken.allowanceOf(
                userA.address,
                userC.address,
            );
        });
        it("should revert with FMMToken__InsuffienceBalance if balance is not enough", async function () {
            const trasferFromAmount = balanceOfUserA + 1n;
            await expect(
                fmmToken.transferFrom(
                    userA.address,
                    userB.address,
                    trasferFromAmount,
                ),
            ).to.revertedWithCustomError(
                fmmToken,
                "FMMToken__InsuffienceBalance",
            );
        });
        it("should revert with FMMToken__InsuffienceAllowance if allowance is not enough", async function () {
            const trasferFromAmount = allowanceFromAToC + 1n;
            await expect(
                fmmToken
                    .connect(userC)
                    .transferFrom(userA, userB, trasferFromAmount),
            ).to.revertedWithCustomError(
                fmmToken,
                "FMMToken__InsuffienceAllowance",
            );
        });
        it("should tranfer from A to B by C successfully", async function () {
            await fmmToken
                .connect(userC)
                .transferFrom(userA.address, userB.address, TRANSFER_AMOUNT);
            const updatedOfUserA = await fmmToken.balanceOf(userA.address);
            const updatedOfUserB = await fmmToken.balanceOf(userB.address);
            const updatedOfUserC = await fmmToken.balanceOf(userC.address);
            assert.equal(updatedOfUserA, balanceOfUserA - TRANSFER_AMOUNT);
            assert.equal(updatedOfUserB, balanceOfUserB + TRANSFER_AMOUNT);
            assert.equal(updatedOfUserC, balanceOfUserC);
        });
        it("should reduce allowance successfully", async function () {
            await fmmToken
                .connect(userC)
                .transferFrom(userA.address, userB.address, TRANSFER_AMOUNT);
            const updatedAllowanceOfAToC = await fmmToken.allowanceOf(
                userA,
                userC,
            );
            assert.equal(
                updatedAllowanceOfAToC,
                allowanceFromAToC - TRANSFER_AMOUNT,
            );
        });
        it("should transfer from A to B by A self successfully", async function () {
            await fmmToken
                .connect(userA)
                .transferFrom(userA.address, userB.address, TRANSFER_AMOUNT);
            const updatedOfUserA = await fmmToken.balanceOf(userA.address);
            const updatedOfUserB = await fmmToken.balanceOf(userB.address);
            assert.equal(updatedOfUserA, balanceOfUserA - TRANSFER_AMOUNT);
            assert.equal(updatedOfUserB, balanceOfUserB + TRANSFER_AMOUNT);
        });
        if (
            ("should emit Transfer event",
            async function () {
                await expect(
                    fmmToken
                        .connect(userC)
                        .transferFrom(userA, userB, TRANSFER_AMOUNT),
                )
                    .to.emit(fmmToken, "Transfer")
                    .withArgs(userA, userB, TRANSFER_AMOUNT);
            })
        );
    });
});
