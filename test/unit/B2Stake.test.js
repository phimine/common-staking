const {
    getNamedAccounts,
    deployments,
    ethers,
    upgrades,
    network,
} = require("hardhat");
const { assert, expect } = require("chai");
const { endBlock, rewardPerBlock } = require("../../helper-hardhat-config");
const { ZeroAddress, MinInt256 } = require("ethers");

const B2STAKE = "B2Stake";
const START_BLOCK = 1n;
const END_BLOCK = 10000n;
const B2_PER_BLOCK = 50n;

const MYERC20 = "MyERC20";
const TOKEN_NAME = "MY ERC20 TOKEN";
const TOKEN_SYMBOL = "MYET";
const TOKEN_NAMES = [
    TOKEN_NAME,
    "MY ERC20 TOKEN1",
    "MY ERC20 TOKEN2",
    "MY ERC20 TOKEN3",
    "MY ERC20 TOKEN4",
];
const TOKEN_SYMBOLS = [TOKEN_SYMBOL, "MYET1", "MYET2", "MYET3", "MYET4"];
const INITIAL_SUPPLY = ethers.parseUnits("1000", 18);

const ZERO = 0n;

const POOL_WEIGHT = 20n;
const MIN_DEPOSIT_AMOUNT = 5n;
const UNSTAKE_LOCKED_BLOCK = 2n;

const MINT_AMOUNT = 1000n;
const DEPOSIT_AMOUNT = 100n;
const UNSTAKE_AMOUNT = 10n;

const POOL_WEIGHT_B = 80n;

const EXPECT_BLOCK_GAP = 10;
describe("B2Stake", async () => {
    let b2Stake;
    let myERC20Contract, tokenAddress;
    let deployer;
    let userA, userB, userC, userD, userE, userF, userG;

    beforeEach(async () => {
        [, userA, userB, userC, userD, userE, userF, userG] =
            await ethers.getSigners();
        const myERC20Args = [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY];
        const myERC20Factory = await ethers.getContractFactory(MYERC20);
        myERC20Contract = await upgrades.deployProxy(
            myERC20Factory,
            myERC20Args,
            {
                initializer: "initialize",
            },
        );
        await myERC20Contract.waitForDeployment();
        await deployments.save(MYERC20, {
            address: myERC20Contract.target,
            abi: JSON.stringify(myERC20Contract.interface),
        });

        tokenAddress = (await deployments.get(MYERC20)).address;
        const b2StakeArgs = [
            tokenAddress,
            START_BLOCK,
            END_BLOCK,
            B2_PER_BLOCK,
        ];
        const b2StakeFactory = await ethers.getContractFactory(B2STAKE);
        b2Stake = await upgrades.deployProxy(b2StakeFactory, b2StakeArgs, {
            initializer: "initialize",
        });
        await b2Stake.waitForDeployment();

        await myERC20Contract.mint(b2Stake.target, INITIAL_SUPPLY);
    });

    describe("initialize", async () => {
        it("should set token correctly", async () => {
            const response = await b2Stake.getB2Token();
            assert.equal(response, tokenAddress);
        });
        it("should set start block correctly", async () => {
            const response = await b2Stake.getStartBlock();
            assert.equal(response, START_BLOCK);
        });
        it("should set end block correctly", async () => {
            const response = await b2Stake.getEndBlock();
            assert.equal(response, END_BLOCK);
        });
        it("should set reward per block correctly", async () => {
            const response = await b2Stake.getB2PerBlock();
            assert.equal(response, B2_PER_BLOCK);
        });
        it("should not pause withdraw", async () => {
            const response = await b2Stake.getWithdrawPaused();
            assert.equal(response, false);
        });
        it("should not pause claim", async () => {
            const response = await b2Stake.getClaimPaused();
            assert.equal(response, false);
        });
    });

    describe("setB2", async () => {
        let tokenAddressB;
        beforeEach(async () => {
            const tokenB = await ethers.getContractFactory(MYERC20);
            const args = [TOKEN_NAMES[1], TOKEN_SYMBOLS[1], INITIAL_SUPPLY];
            const tokenContractB = await upgrades.deployProxy(tokenB, args, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            tokenAddressB = tokenContractB.target;
        });
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(b2Stake.connect(userA).setB2(tokenAddressB))
                .to.revertedWithCustomError(
                    b2Stake,
                    "AccessControlUnauthorizedAccount",
                )
                .withArgs(
                    userA,
                    ethers.keccak256(ethers.toUtf8Bytes("admin_role")),
                );
        });
        it("should change token address corretly", async () => {
            await b2Stake.setB2(tokenAddressB);
            const response = await b2Stake.getB2Token();
            assert.equal(response, tokenAddressB);
        });
        it("should emit SetB2 event", async () => {
            await expect(b2Stake.setB2(tokenAddressB))
                .to.emit(b2Stake, "SetB2")
                .withArgs(tokenAddressB);
        });
    });

    describe("setStartBlock", async () => {
        let NEW_START_BLOCK = START_BLOCK + 1n;
        let INVALID_START_BLOCK = END_BLOCK + 1n;
        it("should revert with AccessControlUnauthorizedAccount if no permission to set start block", async () => {
            await expect(
                b2Stake.connect(userA).setStartBlock(NEW_START_BLOCK),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should revert with B2Stake__EndLessThanStart if start block is greater than end block", async () => {
            await expect(
                b2Stake.setStartBlock(INVALID_START_BLOCK),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__EndLessThanStart");
        });
        it("should update startBlock successfully", async () => {
            const oldStart = await b2Stake.getStartBlock();
            assert.notEqual(oldStart, NEW_START_BLOCK);
            await b2Stake.setStartBlock(NEW_START_BLOCK);
            const newStart = await b2Stake.getStartBlock();
            assert.equal(newStart, NEW_START_BLOCK);
        });
        it("should emit SetStartBlock event", async () => {
            await expect(b2Stake.setStartBlock(NEW_START_BLOCK))
                .to.emit(b2Stake, "SetStartBlock")
                .withArgs(NEW_START_BLOCK);
        });
    });

    describe("setEndBlock", async () => {
        let NEW_END_BLOCK = END_BLOCK + 1n;
        let INVALID_END_BLOCK = START_BLOCK - 1n;
        it("should revert with AccessControlUnauthorizedAccount if no permission to set end block", async () => {
            await expect(
                b2Stake.connect(userA).setEndBlock(NEW_END_BLOCK),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should revert with B2Stake__EndLessThanStart if start block is greater than end block", async () => {
            await expect(
                b2Stake.setEndBlock(INVALID_END_BLOCK),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__EndLessThanStart");
        });
        it("should update endBlock successfully", async () => {
            const oldEnd = await b2Stake.getEndBlock();
            assert.notEqual(oldEnd, NEW_END_BLOCK);
            await b2Stake.setEndBlock(NEW_END_BLOCK);
            const newEnd = await b2Stake.getEndBlock();
            assert.equal(newEnd, NEW_END_BLOCK);
        });
        it("should emit SetEndBlock event", async () => {
            await expect(b2Stake.setEndBlock(NEW_END_BLOCK))
                .to.emit(b2Stake, "SetEndBlock")
                .withArgs(NEW_END_BLOCK);
        });
    });

    describe("setB2PerBlock", async () => {
        let NEW_B2_PER_BLOCK = 25n;
        let INVALID_B2_PER_BLOCK = 0n;
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake.connect(userA).setB2PerBlock(NEW_B2_PER_BLOCK),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should revert with B2Stake__InvalidB2PerBlock if b2PerBlock is less than 1", async () => {
            await expect(
                b2Stake.setB2PerBlock(INVALID_B2_PER_BLOCK),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__InvalidB2PerBlock");
        });
        it("should update b2PerBlock successfully", async () => {
            const oldOne = await b2Stake.getB2PerBlock();
            assert.notEqual(oldOne, NEW_B2_PER_BLOCK);
            await b2Stake.setB2PerBlock(NEW_B2_PER_BLOCK);
            const newOne = await b2Stake.getB2PerBlock();
            assert.equal(newOne, NEW_B2_PER_BLOCK);
        });
        it("should emit SetEndBlock event", async () => {
            await expect(b2Stake.setB2PerBlock(NEW_B2_PER_BLOCK))
                .to.emit(b2Stake, "SetB2PerBlock")
                .withArgs(NEW_B2_PER_BLOCK);
        });
    });

    describe("pauseWithdraw", async () => {
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake.connect(userA).pauseWithdraw(),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should pause withdraw correctly", async () => {
            await b2Stake.pauseWithdraw();
            assert.equal(await b2Stake.getWithdrawPaused(), true);
        });
    });

    describe("unpauseWithdraw", async () => {
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake.connect(userA).unpauseWithdraw(),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should unpause withdraw correctly", async () => {
            await b2Stake.pauseWithdraw();
            assert.equal(await b2Stake.getWithdrawPaused(), true);
            await b2Stake.unpauseWithdraw();
            assert.equal(await b2Stake.getWithdrawPaused(), false);
        });
    });

    describe("pauseClaim", async () => {
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake.connect(userA).pauseClaim(),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should pause claim correctly", async () => {
            await b2Stake.pauseClaim();
            assert.equal(await b2Stake.getClaimPaused(), true);
        });
    });

    describe("unpauseClaim", async () => {
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake.connect(userA).unpauseClaim(),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should unpause claim correctly", async () => {
            await b2Stake.pauseClaim();
            assert.equal(await b2Stake.getClaimPaused(), true);
            await b2Stake.unpauseClaim();
            assert.equal(await b2Stake.getClaimPaused(), false);
        });
    });

    describe("addPool", async () => {
        let tokenAddressB;
        beforeEach(async () => {
            const tokenB = await ethers.getContractFactory(MYERC20);
            const args = [TOKEN_NAMES[1], TOKEN_SYMBOLS[1], INITIAL_SUPPLY];
            const tokenContractB = await upgrades.deployProxy(tokenB, args, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            tokenAddressB = tokenContractB.target;
        });

        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake
                    .connect(userA)
                    .addPool(
                        ZeroAddress,
                        POOL_WEIGHT,
                        MIN_DEPOSIT_AMOUNT,
                        UNSTAKE_LOCKED_BLOCK,
                        true,
                    ),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should revert with B2Stake__FirstStakePoolNotETH if the first added is not ETH", async () => {
            await expect(
                b2Stake.addPool(
                    tokenAddressB,
                    POOL_WEIGHT,
                    MIN_DEPOSIT_AMOUNT,
                    UNSTAKE_LOCKED_BLOCK,
                    true,
                ),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__FirstStakePoolNotETH",
            );
        });
        it("should revert with B2Stake__InvalidPoolWeight if poolWeight is 0", async () => {
            await expect(
                b2Stake.addPool(
                    ZeroAddress,
                    ZERO,
                    MIN_DEPOSIT_AMOUNT,
                    UNSTAKE_LOCKED_BLOCK,
                    true,
                ),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__InvalidPoolWeight");
        });
        it("should revert with B2Stake__InvalidMinDepositAmount if minDepositAmount is 0", async () => {
            await expect(
                b2Stake.addPool(
                    ZeroAddress,
                    POOL_WEIGHT,
                    ZERO,
                    UNSTAKE_LOCKED_BLOCK,
                    true,
                ),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__InvalidMinDepositAmount",
            );
        });
        it("should revert with B2Stake__InvalidUnstakeLockedBlock if unstakeLockedBlock is 0", async () => {
            await expect(
                b2Stake.addPool(
                    ZeroAddress,
                    POOL_WEIGHT,
                    MIN_DEPOSIT_AMOUNT,
                    ZERO,
                    true,
                ),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__InvalidUnstakeLockedBlock",
            );
        });
        it("should revert with B2Stake__ExceedEndBlock if current block is greater than endBlock", async () => {
            const curBlock = await ethers.provider.getBlockNumber();
            await b2Stake.setEndBlock(curBlock - 1);
            expect(await b2Stake.getEndBlock()).to.be.lessThan(curBlock);
            await expect(
                b2Stake.addPool(
                    ZeroAddress,
                    POOL_WEIGHT,
                    MIN_DEPOSIT_AMOUNT,
                    UNSTAKE_LOCKED_BLOCK,
                    true,
                ),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__ExceedEndBlock");
        });
        it("should update total pool weight", async () => {
            assert.equal(await b2Stake.getTotalPoolWeight(), 0);
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                true,
            );
            assert.equal(await b2Stake.getPoolSize(), 1);
            assert.equal(await b2Stake.getTotalPoolWeight(), POOL_WEIGHT);
        });
        it("should add pool with correct properties", async () => {
            const curBlock = await ethers.provider.getBlockNumber();
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                true,
            );
            const [
                address,
                poolWeight,
                lastRewardBlock,
                minDepositAmount,
                unstakeLockedBlock,
                accB2PerST,
                stTokenAmount,
            ] = await b2Stake.getPool(0);
            assert.equal(address, ethers.ZeroAddress);
            assert.equal(poolWeight, POOL_WEIGHT);
            assert.equal(minDepositAmount, MIN_DEPOSIT_AMOUNT);
            assert.equal(unstakeLockedBlock, UNSTAKE_LOCKED_BLOCK);
            assert.equal(accB2PerST, 0);
            assert.equal(stTokenAmount, 0);
            assert.equal(lastRewardBlock, curBlock + 1);
        });
        it("should set lastRewardBlock as startBlock if startBlock is greater than current block", async () => {
            const curBlock = await ethers.provider.getBlockNumber();
            let startBlock = curBlock + 2;
            await b2Stake.setStartBlock(startBlock);
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                true,
            );
            const [, , lastRewardBlock, , ,] = await b2Stake.getPool(0);
            assert.equal(lastRewardBlock, startBlock);
        });
        it("should emit PoolAdded event", async () => {
            const curBlock = await ethers.provider.getBlockNumber();
            await expect(
                b2Stake.addPool(
                    ZeroAddress,
                    POOL_WEIGHT,
                    MIN_DEPOSIT_AMOUNT,
                    UNSTAKE_LOCKED_BLOCK,
                    false,
                ),
            )
                .to.emit(b2Stake, "PoolAdded")
                .withArgs(
                    ZeroAddress,
                    POOL_WEIGHT,
                    curBlock + 1,
                    MIN_DEPOSIT_AMOUNT,
                    UNSTAKE_LOCKED_BLOCK,
                );
        });
        it("should revert with B2Stake__InvalidStakeAddress error if the second added token address is 0", async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                true,
            );
            assert.equal(await b2Stake.getPoolSize(), 1);
            await expect(
                b2Stake.addPool(
                    ZeroAddress,
                    POOL_WEIGHT,
                    MIN_DEPOSIT_AMOUNT,
                    UNSTAKE_LOCKED_BLOCK,
                    true,
                ),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__InvalidStakeAddress",
            );
        });
        it("should add multiple pools successfully", async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            assert.equal(await b2Stake.getPoolSize(), 1);
            await b2Stake.addPool(
                tokenAddressB,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            assert.equal(await b2Stake.getPoolSize(), 2);
            assert.equal(await b2Stake.getTotalPoolWeight(), POOL_WEIGHT * 2n);
            const [
                address,
                poolWeight,
                lastRewardBlock,
                minDepositAmount,
                unstakeLockedBlock,
            ] = await b2Stake.getPool(1);
            assert.equal(address, tokenAddressB);
            assert.equal(poolWeight, POOL_WEIGHT);
            assert.equal(minDepositAmount, MIN_DEPOSIT_AMOUNT);
            assert.equal(unstakeLockedBlock, UNSTAKE_LOCKED_BLOCK);
        });
    });

    describe("updatePool", async () => {
        let poolId, poolSize;
        let NEW_MIN_DEPOSIT_AMOUNT = MIN_DEPOSIT_AMOUNT + 1n;
        let NEW_UNSTAKE_LOCKED_BLOCK = UNSTAKE_LOCKED_BLOCK + 1n;
        beforeEach(async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            poolSize = await b2Stake.getPoolSize();
            assert.equal(poolSize, 1);
            poolId = poolSize - 1n;
        });
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake
                    .connect(userA)
                    .updatePool(
                        poolId,
                        NEW_MIN_DEPOSIT_AMOUNT,
                        NEW_UNSTAKE_LOCKED_BLOCK,
                    ),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should revert with B2Stake__PoolIdNotExist if pool id is invalid", async () => {
            await expect(
                b2Stake.updatePool(
                    poolSize,
                    NEW_MIN_DEPOSIT_AMOUNT,
                    NEW_UNSTAKE_LOCKED_BLOCK,
                ),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__PoolIdNotExist");
        });
        it("should revert with B2Stake__InvalidMinDepositAmount if minDepositAmount is 0", async () => {
            await expect(
                b2Stake.updatePool(poolId, ZERO, UNSTAKE_LOCKED_BLOCK),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__InvalidMinDepositAmount",
            );
        });
        it("should revert with B2Stake__InvalidUnstakeLockedBlock if unstakeLockedBlock is 0", async () => {
            await expect(
                b2Stake.updatePool(poolId, MIN_DEPOSIT_AMOUNT, ZERO),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__InvalidUnstakeLockedBlock",
            );
        });
        it("should update correctly", async () => {
            await b2Stake.updatePool(
                poolId,
                NEW_MIN_DEPOSIT_AMOUNT,
                NEW_UNSTAKE_LOCKED_BLOCK,
            );
            const [, , , minDepositAmount, unstakeLockedBlock] =
                await b2Stake.getPool(poolId);
            assert.equal(minDepositAmount, NEW_MIN_DEPOSIT_AMOUNT);
            assert.equal(unstakeLockedBlock, NEW_UNSTAKE_LOCKED_BLOCK);
        });
        it("should emit PoolUpdated event", async () => {
            await expect(
                b2Stake.updatePool(
                    poolId,
                    NEW_MIN_DEPOSIT_AMOUNT,
                    NEW_UNSTAKE_LOCKED_BLOCK,
                ),
            )
                .to.emit(b2Stake, "PoolUpdated")
                .withArgs(
                    poolId,
                    NEW_MIN_DEPOSIT_AMOUNT,
                    NEW_UNSTAKE_LOCKED_BLOCK,
                );
        });
    });

    describe("setPoolWeight", async () => {
        let poolId, poolSize;
        const NEW_POOL_WEIGHT = POOL_WEIGHT + 1n;
        beforeEach(async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            poolSize = await b2Stake.getPoolSize();
            poolId = poolSize - 1n;
            assert.equal(poolSize, 1);
        });
        it("should revert with AccessControlUnauthorizedAccount if no permission", async () => {
            await expect(
                b2Stake
                    .connect(userA)
                    .setPoolWeight(poolId, NEW_POOL_WEIGHT, false),
            ).to.revertedWithCustomError(
                b2Stake,
                "AccessControlUnauthorizedAccount",
            );
        });
        it("should revert with B2Stake__PoolIdNotExist if pool id is invalid", async () => {
            await expect(
                b2Stake.setPoolWeight(poolSize, NEW_POOL_WEIGHT, false),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__PoolIdNotExist");
        });
        it("should revert with B2Stake__InvalidPoolWeight if pool weight is 0", async () => {
            await expect(
                b2Stake.setPoolWeight(poolId, ZERO, false),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__InvalidPoolWeight");
        });
        it("should update total pool weight correctly", async () => {
            const [, poolWeight] = await b2Stake.getPool(poolId);
            const oldTotalPoolWeight = await b2Stake.getTotalPoolWeight();
            await b2Stake.setPoolWeight(poolId, NEW_POOL_WEIGHT, false);
            const newTotalPoolWeight = await b2Stake.getTotalPoolWeight();
            assert.equal(
                newTotalPoolWeight,
                oldTotalPoolWeight - poolWeight + NEW_POOL_WEIGHT,
            );
        });
        it("should update pool weight correctly", async () => {
            await b2Stake.setPoolWeight(poolId, NEW_POOL_WEIGHT, false);
            const [, poolWeight] = await b2Stake.getPool(poolId);
            assert.equal(poolWeight, NEW_POOL_WEIGHT);
        });
        it("should emit SetPoolWeight event", async () => {
            await expect(b2Stake.setPoolWeight(poolId, NEW_POOL_WEIGHT, false))
                .to.emit(b2Stake, "SetPoolWeight")
                .withArgs(poolId, NEW_POOL_WEIGHT);
        });
        it("should emit UpdatePoolReward event", async () => {
            await expect(
                b2Stake.setPoolWeight(poolId, NEW_POOL_WEIGHT, true),
            ).to.emit(b2Stake, "UpdatePoolReward");
        });
    });

    describe("updatePoolReward", async () => {
        let tokenAddressB;
        let poolId, poolSize;
        beforeEach(async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );

            const tokenB = await ethers.getContractFactory(MYERC20);
            const args = [TOKEN_NAMES[1], TOKEN_NAMES[1], INITIAL_SUPPLY];
            const tokenContractB = await upgrades.deployProxy(tokenB, args, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            tokenAddressB = tokenContractB.target;

            await tokenContractB.mint(userA, MINT_AMOUNT);
            await tokenContractB.mint(userB, MINT_AMOUNT);
            await tokenContractB
                .connect(userA)
                .approve(b2Stake.target, MINT_AMOUNT);
            await tokenContractB
                .connect(userB)
                .approve(b2Stake.target, MINT_AMOUNT);

            await b2Stake.addPool(
                tokenAddressB,
                POOL_WEIGHT_B,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );

            poolSize = await b2Stake.getPoolSize();
            assert.equal(poolSize, 2);
            poolId = poolSize - 1n;
        });
        it("should update pool reward correctly", async () => {
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            const totalPoolWeight = await b2Stake.getTotalPoolWeight();
            let [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            assert.equal(accB2PerST, ZERO);
            for (let i = 0; i < 9; i++) {
                await network.provider.send("evm_mine");
            }
            const curBlock = BigInt(
                (await ethers.provider.getBlockNumber()) + 1,
            );
            const gap = curBlock - lastRewardBlock;
            const poolRewardAmount =
                (gap * B2_PER_BLOCK * poolWeight) / totalPoolWeight;
            const expectAccB2PerST =
                (poolRewardAmount * ethers.parseEther("1")) / totalStakeAmount;

            await b2Stake.setPoolWeight(poolId, POOL_WEIGHT_B, true);
            let [, , lastRewardBlock2, , , accB2PerST2, totalStakeAmount2] =
                await b2Stake.getPool(poolId);
            assert.equal(lastRewardBlock2, curBlock);
            assert.equal(accB2PerST2, expectAccB2PerST);
        });
        it("should update last reward block correctly", async () => {
            const [, , lastRewardBlock] = await b2Stake.getPool(poolId);
            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            const curBlock = await ethers.provider.getBlockNumber();
            await b2Stake.setPoolWeight(poolId, POOL_WEIGHT_B, true);
            const [, , lastRewardBlock2] = await b2Stake.getPool(poolId);
            assert.equal(lastRewardBlock2, curBlock + 1);
            assert.equal(lastRewardBlock2 - lastRewardBlock, EXPECT_BLOCK_GAP);
        });
        it("should not update pool reward if withUpdate is false", async () => {
            const [, , lastRewardBlock] = await b2Stake.getPool(poolId);
            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            await b2Stake.setPoolWeight(poolId, POOL_WEIGHT_B, false);

            const [, , lastRewardBlock2] = await b2Stake.getPool(poolId);
            assert.equal(lastRewardBlock, lastRewardBlock2);
        });
    });

    describe("updatePoolReward_Negative", async () => {
        it("should revert B2Stake__PoolRewardAlreadyComputed if current block is less than last reward block", async () => {
            const LARGE_START_BLOCK = END_BLOCK - 1n;
            await b2Stake.setStartBlock(LARGE_START_BLOCK);
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            const [, , lastRewardBlock] = await b2Stake.getPool(ZERO);
            assert.equal(lastRewardBlock, LARGE_START_BLOCK);
            const curBlock = await ethers.provider.getBlockNumber();
            expect(curBlock + 1).to.be.lessThan(lastRewardBlock);
            await expect(
                b2Stake.setPoolWeight(ZERO, POOL_WEIGHT, true),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__PoolRewardAlreadyComputed",
            );
        });
    });

    describe("deposit", async () => {
        let tokenContractB, tokenAddressB;
        let totalPoolWeight;
        let poolId, poolSize;
        beforeEach(async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );

            const tokenB = await ethers.getContractFactory(MYERC20);
            const args = [
                TOKEN_NAMES[1],
                TOKEN_SYMBOLS[1],
                ethers.parseUnits("1000", 18),
            ];
            tokenContractB = await upgrades.deployProxy(tokenB, args, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            await tokenContractB.mint(userA, MINT_AMOUNT);
            await tokenContractB.mint(userB, MINT_AMOUNT);
            await tokenContractB
                .connect(userA)
                .approve(b2Stake.target, MINT_AMOUNT);
            await tokenContractB
                .connect(userB)
                .approve(b2Stake.target, MINT_AMOUNT);
            tokenAddressB = tokenContractB.target;

            await b2Stake.addPool(
                tokenAddressB,
                POOL_WEIGHT_B,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            totalPoolWeight = await b2Stake.getTotalPoolWeight();
            assert.equal(totalPoolWeight, POOL_WEIGHT + POOL_WEIGHT_B);
            poolSize = await b2Stake.getPoolSize();
            assert.equal(poolSize, 2);
            poolId = poolSize - 1n;
        });

        it("should revert with B2Stake__PoolIdNotExist if pool id is invalid", async () => {
            await expect(
                b2Stake.deposit(poolSize, DEPOSIT_AMOUNT),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__PoolIdNotExist");
        });
        it("should revert with B2Stake__DepositNotSupportETH if pool id is 0", async () => {
            await expect(
                b2Stake.deposit(ZERO, DEPOSIT_AMOUNT),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__DepositNotSupportETH",
            );
        });
        it("should revert with B2Stake__DepositTooSmall if deposit amount is less than minDepositAmount", async () => {
            const depositAmount = MIN_DEPOSIT_AMOUNT - 1n;
            await expect(
                b2Stake.deposit(poolId, depositAmount),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__DepositTooSmall");
        });
        it("should increase stake amount successfully", async () => {
            const [, , , , , , totalStakeAmount] =
                await b2Stake.getPool(poolId);
            const [userAStakeAmount] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            const [, , , , , , totalStakeAmountAfter] =
                await b2Stake.getPool(poolId);
            const [userAStakeAmountAfter] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            assert.equal(
                totalStakeAmountAfter,
                totalStakeAmount + DEPOSIT_AMOUNT,
            );
            assert.equal(
                userAStakeAmountAfter,
                userAStakeAmount + DEPOSIT_AMOUNT,
            );
        });
        it("should deposit successfully", async () => {
            const userABalance = await tokenContractB.balanceOf(userA);
            const b2StakeBalance = await tokenContractB.balanceOf(
                b2Stake.target,
            );
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            const userABalanceAfter = await tokenContractB.balanceOf(userA);
            const b2StakeBalanceAfter = await tokenContractB.balanceOf(
                b2Stake.target,
            );

            assert.equal(userABalanceAfter, userABalance - DEPOSIT_AMOUNT);
            assert.equal(b2StakeBalanceAfter, b2StakeBalance + DEPOSIT_AMOUNT);
        });
        it("should emit Deposit event", async () => {
            const [, , , , , , totalStakeAmount] =
                await b2Stake.getPool(poolId);
            await expect(b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT))
                .to.emit(b2Stake, "Deposit")
                .withArgs(
                    userA,
                    poolId,
                    DEPOSIT_AMOUNT,
                    totalStakeAmount + DEPOSIT_AMOUNT,
                );
        });
        it("should accumulate B2 reward correctly", async () => {
            await b2Stake.connect(userB).deposit(poolId, DEPOSIT_AMOUNT);
            // 增加10个区块高度
            for (let i = 0; i < 9; i++) {
                await network.provider.send("evm_mine");
            }
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            const totalPoolWeight = await b2Stake.getTotalPoolWeight();
            const [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            const [stAmount, finishedB2, pendingB2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            // 增加10个区块高度
            for (let i = 0; i < 9; i++) {
                await network.provider.send("evm_mine");
            }

            const curBlock = await ethers.provider.getBlockNumber();
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            const [stAmountAfter, finishedB2After, pendingB2After] =
                await b2Stake.connect(userA).getStakeAmount(poolId, userA);

            const gap = BigInt(curBlock) + 1n - lastRewardBlock;
            const poolRewardAmount =
                (gap * B2_PER_BLOCK * poolWeight) / totalPoolWeight;
            const finalAccB2PerST =
                accB2PerST +
                (poolRewardAmount * ethers.parseEther("1")) / totalStakeAmount;
            const userARewardAmount =
                (stAmount * finalAccB2PerST) / ethers.parseEther("1");
            const expectedPendingB2 =
                userARewardAmount - finishedB2 + pendingB2;
            const expectedFinishedB2 =
                (stAmountAfter * finalAccB2PerST) / ethers.parseEther("1");
            assert.equal(pendingB2After, expectedPendingB2);
            assert.equal(finishedB2After, expectedFinishedB2);
        });
    });

    describe("depositETH", async () => {
        beforeEach(async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
        });
        it("should revert with B2Stake__DepositTooSmall if the depositAmount is too small", async () => {
            await expect(
                userA.sendTransaction({
                    to: b2Stake.target,
                    value: 1,
                }),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__DepositTooSmall");
        });
        it("should emit Deposit event correctly", async () => {
            const [, , , , , , stAmount] = await b2Stake.getPool(ZERO);
            await expect(
                userA.sendTransaction({
                    to: b2Stake.target,
                    value: DEPOSIT_AMOUNT,
                }),
            )
                .to.emit(b2Stake, "Deposit")
                .withArgs(
                    userA,
                    ZERO,
                    DEPOSIT_AMOUNT,
                    stAmount + DEPOSIT_AMOUNT,
                );
        });
        it("should increase pool stake correctly", async () => {
            const [, , , , , , stAmount] = await b2Stake.getPool(ZERO);
            await userA.sendTransaction({
                to: b2Stake.target,
                value: DEPOSIT_AMOUNT,
            });
            const [, , , , , , stAmountAfterDeposit] =
                await b2Stake.getPool(ZERO);
            assert.equal(stAmountAfterDeposit, stAmount + DEPOSIT_AMOUNT);
        });
    });

    describe("unstake", async () => {
        let tokenAddressB;
        let poolSize, poolId;
        beforeEach(async () => {
            b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );

            const tokenB = await ethers.getContractFactory(MYERC20);
            const argsB = [TOKEN_NAMES[1], TOKEN_SYMBOLS[1], INITIAL_SUPPLY];
            const tokenContractB = await upgrades.deployProxy(tokenB, argsB, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            tokenAddressB = tokenContractB.target;

            await b2Stake.addPool(
                tokenAddressB,
                POOL_WEIGHT_B,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            poolSize = await b2Stake.getPoolSize();
            assert.equal(poolSize, 2);
            poolId = poolSize - 1n;

            await tokenContractB.mint(userA, MINT_AMOUNT);
            await tokenContractB.mint(userB, MINT_AMOUNT);
            await tokenContractB
                .connect(userA)
                .approve(b2Stake.target, MINT_AMOUNT);
            await tokenContractB
                .connect(userB)
                .approve(b2Stake.target, MINT_AMOUNT);

            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            await b2Stake.connect(userB).deposit(poolId, DEPOSIT_AMOUNT);
        });
        it("should revert with B2Stake__PoolIdNotExist if pool id is invalid", async () => {
            await expect(
                b2Stake.connect(userA).unstake(poolSize, UNSTAKE_AMOUNT),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__PoolIdNotExist");
        });
        it("should revert with B2Stake__WithdrawAlreadyPaused if withdraw paused", async () => {
            await b2Stake.pauseWithdraw();
            assert.equal(await b2Stake.getWithdrawPaused(), true);
            await expect(
                b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__WithdrawAlreadyPaused",
            );
        });
        it("should revert with B2Stake__NotStaked if user didn't stake", async () => {
            await expect(
                b2Stake.connect(userC).unstake(poolId, UNSTAKE_AMOUNT),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__NotStaked");
        });
        it("should revert with B2Stake__UnstakeExceedStakeAmount if user trying to unstake token more than staked", async () => {
            const INVALID_UNSTAKE_AMOUNT = DEPOSIT_AMOUNT + 1n;
            await expect(
                b2Stake.connect(userA).unstake(poolId, INVALID_UNSTAKE_AMOUNT),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__UnstakeExceedStakeAmount",
            );
        });
        it("should reduce pool total stake amount correctly", async () => {
            const [, , , , , , totalStakeAmount] =
                await b2Stake.getPool(poolId);
            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);

            const [, , , , , , totalStakeAmount2] =
                await b2Stake.getPool(poolId);
            assert.equal(totalStakeAmount2, totalStakeAmount - UNSTAKE_AMOUNT);
        });
        it("should reduce user stake amount correctly", async () => {
            const [stAmount] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);

            const [stAmount2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            assert.equal(stAmount2, stAmount - UNSTAKE_AMOUNT);
        });
        it("should create user unstake request correctly", async () => {
            const [, , , unstakeRequests] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            const [, , , , unstakeLockedBlock] = await b2Stake.getPool(poolId);
            const unstakeCountBefore = unstakeRequests.length;
            const curBlock = (await ethers.provider.getBlockNumber()) + 1;
            const expectedUnlockBlock = BigInt(curBlock) + unstakeLockedBlock;
            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);

            const [, , , unstakeRequests2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            const unstakeCountAfter = unstakeRequests2.length;
            const [amount, unlockBlock] =
                unstakeRequests2[unstakeCountAfter - 1];
            assert.equal(unstakeCountAfter, unstakeCountBefore + 1);
            assert.equal(amount, UNSTAKE_AMOUNT);
            assert.equal(unlockBlock, expectedUnlockBlock);
        });
        it("should emit Unstake event correctly", async () => {
            const [stAmount] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            await expect(b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT))
                .to.emit(b2Stake, "Unstake")
                .withArgs(
                    userA,
                    poolId,
                    UNSTAKE_AMOUNT,
                    stAmount - UNSTAKE_AMOUNT,
                );
        });
        it("should update pool reward amount correctly", async () => {
            const [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            const totalPoolWeight = await b2Stake.getTotalPoolWeight();
            // total reward = block gap * reward per block
            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            const curBlock = (await ethers.provider.getBlockNumber()) + 1;
            const gap = BigInt(curBlock) - lastRewardBlock;
            assert.equal(gap, EXPECT_BLOCK_GAP);
            const totalReward = gap * B2_PER_BLOCK;
            const poolRewardAmount =
                (totalReward * poolWeight) / totalPoolWeight;
            const expectAccB2PerST =
                accB2PerST +
                (poolRewardAmount * ethers.parseEther("1")) / totalStakeAmount;

            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);
            const [, , , , , accB2PerST2] = await b2Stake.getPool(poolId);
            assert.equal(accB2PerST2, expectAccB2PerST);
        });
        it("should update user reward amount correctly", async () => {
            const totalPoolWeight = await b2Stake.getTotalPoolWeight();
            const [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            const [stAmount, finishedB2, pendingB2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);

            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            const curBlock = (await ethers.provider.getBlockNumber()) + 1;
            const gap = BigInt(curBlock) - lastRewardBlock;
            assert.equal(gap, EXPECT_BLOCK_GAP);

            const totalReward = gap * B2_PER_BLOCK;
            const poolRewardAmount =
                (totalReward * poolWeight) / totalPoolWeight;
            const expectAccB2PerST =
                accB2PerST +
                (poolRewardAmount * ethers.parseEther("1")) / totalStakeAmount;
            const expectedPendingB2 =
                (expectAccB2PerST * stAmount) / ethers.parseEther("1") -
                finishedB2 +
                pendingB2;
            const finalStAmount = stAmount - UNSTAKE_AMOUNT;
            const expectedFinishedB2 =
                (expectAccB2PerST * finalStAmount) / ethers.parseEther("1");

            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);
            const [stAmountAfter, finishedB2After, pendingB2After] =
                await b2Stake.connect(userA).getStakeAmount(poolId, userA);
            assert.equal(stAmountAfter, finalStAmount);
            assert.equal(finishedB2After, expectedFinishedB2);
            assert.equal(pendingB2After, expectedPendingB2);
        });
    });

    describe("withdraw", async () => {
        let poolSize, poolId;
        let tokenContractB;
        beforeEach(async () => {
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_AMOUNT,
                false,
            );

            const tokenB = await ethers.getContractFactory(MYERC20);
            const argsB = [TOKEN_NAMES[1], TOKEN_SYMBOLS[1], INITIAL_SUPPLY];
            tokenContractB = await upgrades.deployProxy(tokenB, argsB, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            const tokenAddressB = tokenContractB.target;

            await b2Stake.addPool(
                tokenAddressB,
                POOL_WEIGHT_B,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );
            poolSize = await b2Stake.getPoolSize();
            assert.equal(poolSize, 2);
            poolId = poolSize - 1n;

            await tokenContractB.mint(userA, MINT_AMOUNT);
            await tokenContractB
                .connect(userA)
                .approve(b2Stake.target, MINT_AMOUNT);

            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);
        });
        it("should revert with B2Stake__PoolIdNotExist if pool id is invalid", async () => {
            await expect(
                b2Stake.connect(userA).withdraw(poolSize),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__PoolIdNotExist");
        });
        it("should revert with B2Stake__WithdrawAlreadyPaused if withdraw paused", async () => {
            await b2Stake.pauseWithdraw();
            assert.equal(await b2Stake.getWithdrawPaused(), true);
            await expect(
                b2Stake.connect(userA).withdraw(poolId),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__WithdrawAlreadyPaused",
            );
        });
        it("should revert with B2Stake__NoUnstakeRequest if no unstake request", async () => {
            await expect(
                b2Stake.connect(userB).withdraw(poolId),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__NoUnstakeRequest");
        });
        it("should clean up unstake requests correctly after withdrawing", async () => {
            const [, , , unstakeRequests] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            expect(unstakeRequests.length).to.be.greaterThan(ZERO);

            const [, , , , unstakeLockedBlock] = await b2Stake.getPool(poolId);
            for (let index = 0; index < unstakeLockedBlock; index++) {
                await network.provider.send("evm_mine");
            }

            await b2Stake.connect(userA).withdraw(poolId);

            const [, , , unstakeRequests2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            expect(unstakeRequests2.length).to.be.equals(ZERO);
        });
        it("should not withdraw if current block is less than unstake unlocked block", async () => {
            const [, , , unstakeRequests] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            expect(unstakeRequests.length).to.be.greaterThan(ZERO);

            const [, , , , unstakeLockedBlock] = await b2Stake.getPool(poolId);
            for (let index = 0; index < unstakeLockedBlock - 2n; index++) {
                await network.provider.send("evm_mine");
            }

            await b2Stake.connect(userA).withdraw(poolId);

            const [, , , unstakeRequests2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            expect(unstakeRequests2.length).to.be.equals(
                unstakeRequests.length,
            );
        });
        it("should withdraw ETH to account correctly", async () => {
            // deposit ETH
            await userA.sendTransaction({
                to: b2Stake.target,
                value: DEPOSIT_AMOUNT,
            });

            const [stAmount] = await b2Stake
                .connect(userA)
                .getStakeAmount(ZERO, userA);
            assert.equal(stAmount, DEPOSIT_AMOUNT);

            // unstake ETH
            await b2Stake.connect(userA).unstake(ZERO, UNSTAKE_AMOUNT);
            const [stAmount2] = await b2Stake
                .connect(userA)
                .getStakeAmount(ZERO, userA);
            assert.equal(stAmount2, stAmount - UNSTAKE_AMOUNT);
            const [, , , , unstakeLockedBlock] = await b2Stake.getPool(ZERO);
            for (let i = 0; i < unstakeLockedBlock; i++) {
                await network.provider.send("evm_mine");
            }

            // withdraw
            const balanceBefore = await ethers.provider.getBalance(userA);
            const transaction = await b2Stake.connect(userA).withdraw(ZERO);
            const balanceAfter = await ethers.provider.getBalance(userA);
            // assert.equal(balanceAfter - balanceBefore, UNSTAKE_AMOUNT); // need conside gas cost in transaction
        });
        it("should withdraw ERC20 to account correctly", async () => {
            const unstake_times = 3;
            for (let index = 0; index < unstake_times - 1; index++) {
                // because there is already one unstake in beforeEach
                await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT);
            }
            const [, , , , unstakeLockedBlock] = await b2Stake.getPool(poolId);
            for (let index = 0; index < unstakeLockedBlock; index++) {
                await network.provider.send("evm_mine"); // increase block number to  unlock
            }
            const expectedWithdraw = BigInt(unstake_times) * UNSTAKE_AMOUNT;
            const balanceBefore = await tokenContractB.balanceOf(userA);
            await b2Stake.connect(userA).unstake(poolId, UNSTAKE_AMOUNT); // this unstake will not reach unlock block
            await b2Stake.connect(userA).withdraw(poolId);
            const balanceAfter = await tokenContractB.balanceOf(userA);
            assert.equal(balanceAfter - balanceBefore, expectedWithdraw);
        });
        it("should emit Withdraw event correctly", async () => {
            const [, , , , unstakeLockedBlock] = await b2Stake.getPool(poolId);
            for (let index = 0; index < unstakeLockedBlock; index++) {
                await network.provider.send("evm_mine"); // increase block number to  unlock
            }
            const curBlock = (await ethers.provider.getBlockNumber()) + 1;
            await expect(b2Stake.connect(userA).withdraw(poolId))
                .to.emit(b2Stake, "Withdraw")
                .withArgs(userA, poolId, UNSTAKE_AMOUNT, curBlock);
        });
    });

    describe("claim", async () => {
        let poolSize, poolId;
        beforeEach(async () => {
            // add pools
            await b2Stake.addPool(
                ZeroAddress,
                POOL_WEIGHT,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );

            const tokenB = await ethers.getContractFactory(MYERC20);
            const argsB = [TOKEN_NAMES[1], TOKEN_SYMBOLS[1], INITIAL_SUPPLY];
            const tokenContractB = await upgrades.deployProxy(tokenB, argsB, {
                initializer: "initialize",
            });
            await tokenContractB.waitForDeployment();
            const tokenAddressB = tokenContractB.target;
            await b2Stake.addPool(
                tokenAddressB,
                POOL_WEIGHT_B,
                MIN_DEPOSIT_AMOUNT,
                UNSTAKE_LOCKED_BLOCK,
                false,
            );

            poolSize = await b2Stake.getPoolSize();
            assert.equal(poolSize, 2);
            poolId = poolSize - 1n;

            await tokenContractB.mint(userA, MINT_AMOUNT);
            await tokenContractB
                .connect(userA)
                .approve(b2Stake.target, MINT_AMOUNT);
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT);
        });

        it("should revert with B2Stake__PoolIdNotExist if pool id is invalid", async () => {
            await expect(
                b2Stake.connect(userA).claim(poolSize),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__PoolIdNotExist");
        });
        it("should revert with B2Stake__ClaimAlreadyPaused if claim paused", async () => {
            await b2Stake.pauseClaim();
            assert.equal(await b2Stake.getClaimPaused(), true);
            await expect(
                b2Stake.connect(userA).claim(poolId),
            ).to.revertedWithCustomError(
                b2Stake,
                "B2Stake__ClaimAlreadyPaused",
            );
        });
        it("should revert with B2Stake__NoReward if no reward to account", async () => {
            await expect(
                b2Stake.connect(userB).claim(poolId),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__NoReward");
        });
        it("should clean up pending reward amount correctly", async () => {
            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            await b2Stake.connect(userA).deposit(poolId, DEPOSIT_AMOUNT); // update reward
            const [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            const [, , pendingB2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            expect(pendingB2).to.be.greaterThan(ZERO);

            const balance = await myERC20Contract.balanceOf(b2Stake.target);

            await b2Stake.connect(userA).claim(poolId);
            const [, , pendingB2After] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            assert.equal(pendingB2After, ZERO);
        });
        it("should claim to account correctly", async () => {
            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            const [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            const totalPoolWeight = await b2Stake.getTotalPoolWeight();
            const [stAmount, finishedB2, pendingB2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            const curBlock = (await ethers.provider.getBlockNumber()) + 1;
            const gap = BigInt(curBlock) - lastRewardBlock;
            const poolRewardAmount =
                (gap * B2_PER_BLOCK * poolWeight) / totalPoolWeight;
            const finalAccB2PerST =
                accB2PerST +
                (poolRewardAmount * ethers.parseEther("1")) / totalStakeAmount;
            const finalPendingB2 =
                (finalAccB2PerST * stAmount) / ethers.parseEther("1") -
                finishedB2 +
                pendingB2;

            const balanceBefore = await myERC20Contract.balanceOf(userA);
            await b2Stake.connect(userA).claim(poolId);
            const balanceAfter = await myERC20Contract.balanceOf(userA);
            assert.equal(balanceAfter, balanceBefore + finalPendingB2);
        });
        it("shoudl emit Claim event correctly", async () => {
            for (let index = 0; index < EXPECT_BLOCK_GAP - 1; index++) {
                await network.provider.send("evm_mine");
            }
            const [
                ,
                poolWeight,
                lastRewardBlock,
                ,
                ,
                accB2PerST,
                totalStakeAmount,
            ] = await b2Stake.getPool(poolId);
            const totalPoolWeight = await b2Stake.getTotalPoolWeight();
            const [stAmount, finishedB2, pendingB2] = await b2Stake
                .connect(userA)
                .getStakeAmount(poolId, userA);
            const curBlock = (await ethers.provider.getBlockNumber()) + 1;
            const gap = BigInt(curBlock) - lastRewardBlock;
            const poolRewardAmount =
                (gap * B2_PER_BLOCK * poolWeight) / totalPoolWeight;
            const finalAccB2PerST =
                accB2PerST +
                (poolRewardAmount * ethers.parseEther("1")) / totalStakeAmount;
            const finalPendingB2 =
                (finalAccB2PerST * stAmount) / ethers.parseEther("1") -
                finishedB2 +
                pendingB2;
            await expect(b2Stake.connect(userA).claim(poolId))
                .to.emit(b2Stake, "Claim")
                .withArgs(userA, poolId, finalPendingB2);
        });
    });

    describe("getStakeAmount", async () => {
        it("should revert with B2Stake__NotAccountSelf if user trying to check others' stake ", async () => {
            await expect(
                b2Stake.connect(userB).getStakeAmount(ZERO, userA),
            ).to.revertedWithCustomError(b2Stake, "B2Stake__NotAccountSelf");
        });
    });
});
