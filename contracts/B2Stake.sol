// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

// Error
error B2Stake__EndLessThanStart();
error B2Stake__InvalidB2PerBlock();
error B2Stake__WithdrawAlreadyPaused();
error B2Stake__WithdrawAlreadyUnpaused();
error B2Stake__ClaimAlreadyPaused();
error B2Stake__ClaimAlreadyUnpaused();

error B2Stake__FirstStakePoolNotETH();
error B2Stake__InvalidStakeAddress();
error B2Stake__InvalidPoolWeight();
error B2Stake__InvalidMinDepositAmount();
error B2Stake__InvalidUnstakeLockedBlock();
error B2Stake__ExceedEndBlock();

error B2Stake__PoolIdNotExist();
error B2Stake__PoolRewardAlreadyComputed();

error B2Stake__InvalidBlockRange();
error B2Stake__MultiplierOverflow();
error B2Stake__DivideOverflow();
error B2Stake__MathAddOverflow();
error B2Stake__MathSubOverflow();

error B2Stake__DepositTooSmall();
error B2Stake__DepositNotSupportETH();

error B2Stake__UnstakeExceedStakeAmount();
error B2Stake__NotStaked();

error B2Stake__NoUnstakeRequest();

error B2Stake__NoReward();

error B2Stake__NotAccountSelf();

/**
 * @title B2Stake 是一个基于区块链的质押系统，支持多种代币的质押，并基于用户质押的代币数量和时间长度分配 B2 代币作为奖励。
 * 系统可提供多个质押池，每个池可以独立配置质押代币、奖励计算等。
 * @author Carl Fu
 * @notice
 */
contract B2Stake is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;
    using Math for uint256;
    // Type Declarations：质押池、用户质押、解除质押申请
    struct Pool {
        address stTokenAddress; // 质押代币地址
        uint256 poolWeight; // 质押池权重
        uint256 lastRewardBlock; // 最后-次计算奖励的区块
        uint256 minDepositAmount; // 最小质押数量
        uint256 unstakeLockedBlock; // 解除质押的锁定区块数
        uint256 accB2PerST; // 每个质押代币积累的B2奖励
        uint256 stTokenAmount; // 质押代币的总量
    }

    struct UserStake {
        uint256 stAmount; // 用户质押代币的数量
        uint256 finishedB2; // 已经计算过的分配的B2数量
        uint256 pendingB2; // 待领取的B2数量
        UnstakeRequest[] requests; // 解除质押的申请
    }

    struct UnstakeRequest {
        uint256 amount; // 申请解除质押的代币数量
        uint256 unstakeLockedBlock; // 提现解质押代币的锁定区块（大于锁定区块才能提现）
    }

    // State Variables：B2Token、开始区块、结束区块、每个区块的B2奖励数量、质押池列表、总权重、每个质押池的用户质押、提现暂停、获得奖励暂停
    IERC20 public b2Token;
    uint256 private startBlock;
    uint256 private endBlock;
    uint256 private b2PerBlock;

    Pool[] private pools;
    uint256 private totalPoolWeight;

    // pool id => user address => user stake
    mapping(uint256 => mapping(address => UserStake)) private userStakeList;

    bool private withdrawPaused;
    bool private claimPaused;

    bytes32 public constant ADMIN_ROLE = keccak256("admin_role");
    bytes32 public constant UPGRADE_ROLE = keccak256("upgrade_role");
    uint256 public constant ETH_PID = 0;

    // Events：设置B2代币、设置开始区块、设置结束区块、设置区块奖励
    event SetB2(IERC20 b2Token);
    event SetStartBlock(uint256 startBlock);
    event SetEndBlock(uint256 endBlock);
    event SetB2PerBlock(uint256 b2PerBlock);

    event WithdrawPaused();
    event WithdrawUnpaused();
    event ClaimPaused();
    event ClaimPUnpused();

    event PoolAdded(
        address stTokenAddress,
        uint256 poolWeight,
        uint256 lastRewardBlock,
        uint256 minDepositAmount,
        uint256 unstakeLockedBlock
    );
    event PoolUpdated(
        uint256 poolId,
        uint256 minDepositAmount,
        uint256 unstakeLockedBlock
    );
    event SetPoolWeight(uint256 poolId, uint256 poolWeight);

    event Deposit(
        address user,
        uint256 poolId,
        uint256 amount,
        uint256 totalAmount
    );
    event Unstake(
        address user,
        uint256 poolId,
        uint256 amount,
        uint256 totalAmount
    );
    event Withdraw(address user, uint256 poolId, uint256 amount, uint256 block);
    event Claim(address user, uint256 poolId, uint256 amount);

    event UpdatePoolReward(
        uint256 poolId,
        uint256 lastRewardBlock,
        uint256 totalB2,
        uint256 accB2PerST
    );

    // Modifiers
    modifier whenNotWithdrawPaused() {
        if (withdrawPaused) {
            revert B2Stake__WithdrawAlreadyPaused();
        }
        _;
    }

    modifier whenNotClaimPaused() {
        if (claimPaused) {
            revert B2Stake__ClaimAlreadyPaused();
        }
        _;
    }

    modifier validPoolId(uint256 pid) {
        if (pools.length <= pid) {
            revert B2Stake__PoolIdNotExist();
        }
        _;
    }

    // Constructor
    function initialize(
        address _b2Address,
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _b2PerBlock
    ) public initializer {
        // Check: endBlock >= startBlock, b2PerBlock > 0
        _checkStartAndEndBlock(_startBlock, _endBlock);
        _checkB2PerBlock(_b2PerBlock);

        // Effect：权限初始化、b2Token初始化、开始区块、结束区块、区块奖励数
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADE_ROLE, msg.sender);

        setB2(_b2Address);
        startBlock = _startBlock;
        endBlock = _endBlock;
        b2PerBlock = _b2PerBlock;
    }

    // Functions
    // receive/fallback
    receive() external payable {
        depositETH();
    }

    fallback() external payable {
        depositETH();
    }

    // ADMIN FUNCTIONS
    /**
     * 设置B2Token
     * @param _b2Address B2 Token地址
     */
    function setB2(address _b2Address) public onlyRole(ADMIN_ROLE) {
        b2Token = IERC20(_b2Address);

        emit SetB2(b2Token);
    }

    /**
     * 设置开始区块
     * @param _startBlock 开始区块
     */
    function setStartBlock(uint256 _startBlock) public onlyRole(ADMIN_ROLE) {
        _checkStartAndEndBlock(_startBlock, endBlock);

        startBlock = _startBlock;

        emit SetStartBlock(startBlock);
    }

    /**
     * 设置结束区块
     * @param _endBlock 结束区块
     */
    function setEndBlock(uint256 _endBlock) public onlyRole(ADMIN_ROLE) {
        _checkStartAndEndBlock(startBlock, _endBlock);

        endBlock = _endBlock;

        emit SetEndBlock(endBlock);
    }

    /**
     * 设置区块奖励B2数量
     * @param _b2PerBlock 区块奖励B2数量
     */
    function setB2PerBlock(uint256 _b2PerBlock) public onlyRole(ADMIN_ROLE) {
        _checkB2PerBlock(_b2PerBlock);

        b2PerBlock = _b2PerBlock;

        emit SetB2PerBlock(b2PerBlock);
    }

    /**
     * 暂停提现功能
     */
    function pauseWithdraw() public onlyRole(ADMIN_ROLE) whenNotWithdrawPaused {
        withdrawPaused = true;

        emit WithdrawPaused();
    }

    /**
     * 解除暂停提现
     */
    function unpauseWithdraw() public onlyRole(ADMIN_ROLE) {
        if (!withdrawPaused) {
            revert B2Stake__WithdrawAlreadyUnpaused();
        }
        withdrawPaused = false;
        emit WithdrawUnpaused();
    }

    /**
     * 暂停获取奖励功能
     */
    function pauseClaim() public onlyRole(ADMIN_ROLE) whenNotClaimPaused {
        claimPaused = true;
        emit ClaimPaused();
    }

    /**
     * 解除暂停获取奖励
     */
    function unpauseClaim() public onlyRole(ADMIN_ROLE) {
        if (!claimPaused) {
            revert B2Stake__ClaimAlreadyUnpaused();
        }
        claimPaused = false;
        emit ClaimPUnpused();
    }

    // add pool/ update pool/ set pool weight
    function addPool(
        address _stTokenAddress,
        uint256 _poolWeight,
        uint256 _minDepositAmount,
        uint256 _unstakeLockedBlock,
        bool withUpdate
    ) public onlyRole(ADMIN_ROLE) {
        // Check: 第一个质押池必须是ETH、权重必须大于0、最小质押数大于0、解质押锁定区块大于0、当前区块必须小于endBlock
        _checkStTokenAddress(pools.length, _stTokenAddress);
        _checkPoolWeight(_poolWeight);
        _checkMinDepositAmount(_minDepositAmount);
        _checkUnstakeLockedBlock(_unstakeLockedBlock);
        if (block.number >= endBlock) {
            revert B2Stake__ExceedEndBlock();
        }

        // Effect: 计算最后一次奖励区块高度、总权重增加、质押池列表
        if (withUpdate) {
            massUpdatePoolReward();
        }
        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalPoolWeight += _poolWeight;

        pools.push(
            Pool({
                stTokenAddress: _stTokenAddress,
                poolWeight: _poolWeight,
                minDepositAmount: _minDepositAmount,
                unstakeLockedBlock: _unstakeLockedBlock,
                lastRewardBlock: lastRewardBlock,
                accB2PerST: 0,
                stTokenAmount: 0
            })
        );
        // Interaction

        emit PoolAdded(
            _stTokenAddress,
            _poolWeight,
            lastRewardBlock,
            _minDepositAmount,
            _unstakeLockedBlock
        );
    }

    function updatePool(
        uint256 pid,
        uint256 _minDepositAmount,
        uint256 _unstakeLockedBlock
    ) public onlyRole(ADMIN_ROLE) validPoolId(pid) {
        // Check: pId存在、最小质押数大于0、解质押锁定区块大于0
        _checkMinDepositAmount(_minDepositAmount);
        _checkUnstakeLockedBlock(_unstakeLockedBlock);

        // Effect：更新质押池
        Pool storage pool = pools[pid];
        pool.minDepositAmount = _minDepositAmount;
        pool.unstakeLockedBlock = _unstakeLockedBlock;
        // Interaction

        emit PoolUpdated(pid, _minDepositAmount, _unstakeLockedBlock);
    }

    function setPoolWeight(
        uint256 pid,
        uint256 _poolWeight,
        bool withUpdate
    ) public onlyRole(ADMIN_ROLE) validPoolId(pid) {
        // Check：pId存在、权重大于0
        _checkPoolWeight(_poolWeight);

        // Effect：更新之前是否需要计算奖励、更新质押池权重、更新总权重
        if (withUpdate) {
            massUpdatePoolReward();
        }

        Pool storage pool = pools[pid];
        totalPoolWeight = totalPoolWeight - pool.poolWeight + _poolWeight;
        pool.poolWeight = _poolWeight;

        // Interaction

        emit SetPoolWeight(pid, _poolWeight);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}

    // USER FUNCTIONS
    function deposit(
        uint256 pId,
        uint256 amount
    ) public whenNotPaused validPoolId(pId) {
        // Check：pId存在、amount大于质押池最小质押数、不支持ETH质押
        if (pId == ETH_PID) {
            revert B2Stake__DepositNotSupportETH();
        }
        Pool storage pool = pools[pId];
        if (amount < pool.minDepositAmount) {
            revert B2Stake__DepositTooSmall();
        }
        // Effect：质押池总质押数量增加、相关的用户质押计算B2奖励、用户质押数量增加
        _deposit(pId, amount);

        // Interaction：质押的代币转入合约
        if (amount > 0) {
            IERC20(pool.stTokenAddress).safeTransferFrom(
                msg.sender,
                address(this),
                amount
            );
        }
    }

    function depositETH() public payable whenNotPaused {
        // Check：质押池是ETH、大于最小质押数量
        Pool storage pool = pools[ETH_PID];
        if (pool.stTokenAddress != address(0)) {
            revert B2Stake__FirstStakePoolNotETH();
        }
        uint256 amount = msg.value;
        if (amount < pool.minDepositAmount) {
            revert B2Stake__DepositTooSmall();
        }

        // Effect
        _deposit(ETH_PID, amount);
    }

    function unstake(
        uint256 pId,
        uint256 amount
    ) public whenNotPaused whenNotWithdrawPaused validPoolId(pId) {
        // Check：pId存在、amount小于用户质押
        UserStake storage userStake = userStakeList[pId][msg.sender];
        uint256 _stAmount = userStake.stAmount;
        if (_stAmount <= 0) {
            revert B2Stake__NotStaked();
        }
        if (amount > userStake.stAmount) {
            revert B2Stake__UnstakeExceedStakeAmount();
        }

        // Effect：计算质押池奖励、计算用户质押B2奖励、质押池总量减少、更新用户质押数量、新增解除质押申请
        updatePoolReward(pId);

        Pool storage pool = pools[pId];
        uint256 _accB2PerST = pool.accB2PerST;
        // _pendingB2 = _stAmount * accB2PerST - finishedB2 + pendingB2
        uint256 _pendingB2 = _tryMul(_stAmount, _accB2PerST);
        _pendingB2 = _tryDiv(_pendingB2, 1 ether);
        _pendingB2 = _trySub(_pendingB2, userStake.finishedB2);
        _pendingB2 = _tryAdd(_pendingB2, userStake.pendingB2);
        userStake.pendingB2 = _pendingB2;

        // _stAmount -= amount
        _stAmount = _trySub(_stAmount, amount);
        userStake.stAmount = _stAmount;

        // _finishedB2 = _stAmount * accB2PerST
        uint256 _finishedB2 = _tryMul(_stAmount, _accB2PerST);
        _finishedB2 = _tryDiv(_finishedB2, 1 ether);
        userStake.finishedB2 = _finishedB2;

        uint256 _stTokenAmount = pool.stTokenAmount;
        pool.stTokenAmount = _trySub(_stTokenAmount, amount);

        userStake.requests.push(
            UnstakeRequest({
                amount: amount,
                unstakeLockedBlock: block.number + pool.unstakeLockedBlock
            })
        );

        // Interaction
        // emit Unstake
        emit Unstake(msg.sender, pId, amount, _stAmount);
    }

    function withdraw(
        uint256 pId
    ) public whenNotPaused whenNotWithdrawPaused validPoolId(pId) {
        // Check：pId存在、解除质押申请存在
        UnstakeRequest[] storage requests = userStakeList[pId][msg.sender]
            .requests;
        uint256 size = requests.length;
        if (size <= 0) {
            revert B2Stake__NoUnstakeRequest();
        }

        // Effect：计算解除质押的总金额、删除计算过的解除质押申请
        uint256 pendingWithdraw;
        uint256 popNum;
        for (popNum = 0; popNum < size; ) {
            UnstakeRequest storage _request = requests[popNum];
            if (block.number < _request.unstakeLockedBlock) {
                break;
            }
            pendingWithdraw = _tryAdd(pendingWithdraw, _request.amount);
            unchecked {
                ++popNum;
            }
        }

        for (uint256 i = 0; i < size - popNum; i++) {
            requests[i] = requests[i + popNum];
        }

        for (uint256 i = 0; i < popNum; i++) {
            requests.pop();
        }

        // Interaction：ETH转账 | ERC20转账到msg.sender
        if (pendingWithdraw > 0) {
            address _stTokenAddress = pools[pId].stTokenAddress;
            if (_stTokenAddress == address(0)) {
                _safeETHTransfer(msg.sender, pendingWithdraw);
            } else {
                IERC20(_stTokenAddress).safeTransfer(
                    msg.sender,
                    pendingWithdraw
                );
            }
        }

        emit Withdraw(msg.sender, pId, pendingWithdraw, block.number);
    }

    function claim(
        uint256 pId
    ) public whenNotPaused whenNotClaimPaused validPoolId(pId) {
        // Check：pId存在、计算奖励之后pendingB2大于0
        uint256 pendingB2 = _computePendingReward(pId, msg.sender);
        if (pendingB2 <= 0) {
            revert B2Stake__NoReward();
        }
        // Effect：pendingB2归零
        userStakeList[pId][msg.sender].pendingB2 = 0;

        // Interaction：将B2转账到msg.msg.sender
        b2Token.safeTransfer(msg.sender, pendingB2);
        emit Claim(msg.sender, pId, pendingB2);
    }

    // COMMON FUNCTIONS
    /**
     * 计算质押池积累的奖励（accB2PerST、lastRewardBlock）
     * @param pid 质押池ID
     */
    function updatePoolReward(uint256 pid) internal validPoolId(pid) {
        // Check：pId存在、当前区块大于最后一次计算奖励的区块
        Pool storage pool = pools[pid];
        if (block.number <= pool.lastRewardBlock) {
            revert B2Stake__PoolRewardAlreadyComputed();
        }

        // Effect：计算区块奖励（根据当前区块*区块奖励计算总奖励 => 根据权重计算质押池奖励占比 => 总奖励 * 奖励占比 => 除以总质押量得到accB2PerST）
        uint256 totalB2 = _getAccBlockReward(
            pool.lastRewardBlock,
            block.number
        );
        totalB2 = _tryMul(totalB2, pool.poolWeight);
        uint256 poolTotalB2 = _tryDiv(totalB2, totalPoolWeight);

        uint256 poolStAmount = pool.stTokenAmount;
        uint256 _accB2PerST;
        if (poolStAmount > 0) {
            poolTotalB2 = _tryMul(poolTotalB2, 1 ether);
            _accB2PerST = _tryDiv(poolTotalB2, poolStAmount);
            _accB2PerST = _tryAdd(pool.accB2PerST, _accB2PerST);

            pool.accB2PerST = _accB2PerST;
        }

        pool.lastRewardBlock = block.number;

        // Interaction
        emit UpdatePoolReward(pid, block.number, poolTotalB2, _accB2PerST);
    }

    function massUpdatePoolReward() internal {
        uint256 poolSize = pools.length;
        for (uint256 pId = 0; pId < poolSize; ) {
            updatePoolReward(pId);
            unchecked {
                ++pId;
            }
        }
    }

    // internal
    function _computePendingReward(
        uint256 pId,
        address userAddress
    ) internal returns (uint256 pendingB2) {
        Pool storage pool = pools[pId];
        UserStake storage userStake = userStakeList[pId][userAddress];

        updatePoolReward(pId);
        uint256 _accB2PerST = pool.accB2PerST;
        uint256 _stAmount = userStake.stAmount;
        pendingB2 = _tryMul(userStake.stAmount, _accB2PerST);
        pendingB2 = _tryDiv(pendingB2, 1 ether);
        pendingB2 = _trySub(pendingB2, userStake.finishedB2);
        pendingB2 = _tryAdd(pendingB2, userStake.pendingB2);
        userStake.pendingB2 = pendingB2;

        uint256 _finishedB2 = _tryMul(_stAmount, _accB2PerST);
        _finishedB2 = _tryDiv(_finishedB2, 1 ether);
        userStake.finishedB2 = _finishedB2;
    }

    function _safeETHTransfer(address to, uint256 amount) internal {}

    /**
     * 质押池总质押数量增加、相关的用户质押计算B2奖励、用户质押数量增加
     * @param pId 质押池ID
     * @param amount 质押数量
     */
    function _deposit(uint256 pId, uint256 amount) internal {
        Pool storage pool = pools[pId];
        UserStake storage userStake = userStakeList[pId][msg.sender];

        updatePoolReward(pId);

        // userStake: stAmount、finishedB2、pendingB2
        uint256 _accB2PerST = pool.accB2PerST;
        uint256 _stAmount = userStake.stAmount;
        if (_stAmount > 0) {
            // _pendingB2 = stAmount * accB2PerST - finishedB2 + pendingB2
            uint256 pendingB2 = _tryMul(_stAmount, _accB2PerST);
            pendingB2 = _tryDiv(pendingB2, 1 ether);
            pendingB2 = _trySub(pendingB2, userStake.finishedB2);
            if (pendingB2 > 0) {
                pendingB2 = _tryAdd(pendingB2, userStake.pendingB2);
                userStake.pendingB2 = pendingB2;
            }
        }

        if (amount > 0) {
            // _stAmount += amount
            _stAmount = _tryAdd(_stAmount, amount);
            userStake.stAmount = _stAmount;
        }

        // _finishedB2 = _stAmount * _accB2PerST
        uint256 _finishedB2 = _tryMul(_stAmount, _accB2PerST);
        _finishedB2 = _tryDiv(_finishedB2, 1 ether);
        userStake.finishedB2 = _finishedB2;

        uint256 _stTokenAmount = pool.stTokenAmount;
        pool.stTokenAmount = _tryAdd(_stTokenAmount, amount);

        emit Deposit(msg.sender, pId, amount, _stAmount);
    }

    function _getAccBlockReward(
        uint256 _fromBlock,
        uint256 _toBlock
    ) private view returns (uint256 accBlockReward) {
        // Check：from区块小于to区块
        if (_fromBlock > _toBlock) {
            revert B2Stake__InvalidBlockRange();
        }
        // Effect：根据startBlock和endBlock重新设置from和to、区块区间乘以区块奖励得到积累的区块奖励
        if (_fromBlock < startBlock) {
            _fromBlock = startBlock;
        }
        if (_toBlock > endBlock) {
            _toBlock = endBlock;
        }

        accBlockReward = _tryMul(_toBlock - _fromBlock, b2PerBlock);
    }

    function _tryMul(
        uint256 x,
        uint256 y
    ) private pure returns (uint256 multiplier) {
        bool success;
        (success, multiplier) = x.tryMul(y);
        if (!success) {
            revert B2Stake__MultiplierOverflow();
        }
    }

    function _tryDiv(
        uint256 x,
        uint256 y
    ) private pure returns (uint256 retval) {
        bool success;
        (success, retval) = x.tryDiv(y);
        if (!success) {
            revert B2Stake__DivideOverflow();
        }
    }

    function _tryAdd(
        uint256 x,
        uint256 y
    ) private pure returns (uint256 retval) {
        bool success;
        (success, retval) = x.tryAdd(y);
        if (!success) {
            revert B2Stake__MathAddOverflow();
        }
    }

    function _trySub(
        uint256 x,
        uint256 y
    ) private pure returns (uint256 retval) {
        bool success;
        (success, retval) = x.trySub(y);
        if (!success) {
            revert B2Stake__MathSubOverflow();
        }
    }

    function _checkStartAndEndBlock(
        uint256 _startBlock,
        uint256 _endBlock
    ) private pure {
        if (_endBlock < _startBlock) {
            revert B2Stake__EndLessThanStart();
        }
    }

    function _checkB2PerBlock(uint256 _b2PerBlock) private pure {
        if (_b2PerBlock <= 0) {
            revert B2Stake__InvalidB2PerBlock();
        }
    }

    function _checkPoolWeight(uint256 _poolWeight) private pure {
        if (_poolWeight <= 0) {
            revert B2Stake__InvalidPoolWeight();
        }
    }

    function _checkMinDepositAmount(uint256 _minDepositAmount) private pure {
        if (_minDepositAmount <= 0) {
            revert B2Stake__InvalidMinDepositAmount();
        }
    }

    function _checkUnstakeLockedBlock(
        uint256 _unstakeLockedBlock
    ) private pure {
        if (_unstakeLockedBlock <= 0) {
            revert B2Stake__InvalidUnstakeLockedBlock();
        }
    }

    function _checkStTokenAddress(
        uint256 poolSize,
        address _stTokenAddress
    ) private pure {
        if (poolSize > 0 && _stTokenAddress == address(0)) {
            revert B2Stake__InvalidStakeAddress();
        } else if (poolSize == 0 && _stTokenAddress != address(0)) {
            revert B2Stake__FirstStakePoolNotETH();
        }
    }

    function getB2Token() public view returns (address) {
        return address(b2Token);
    }

    function getStartBlock() public view returns (uint256) {
        return startBlock;
    }

    function getEndBlock() public view returns (uint256) {
        return endBlock;
    }

    function getB2PerBlock() public view returns (uint256) {
        return b2PerBlock;
    }

    function getWithdrawPaused() public view returns (bool) {
        return withdrawPaused;
    }

    function getClaimPaused() public view returns (bool) {
        return claimPaused;
    }

    function getPoolSize() public view returns (uint256) {
        return pools.length;
    }

    function getPool(uint256 index) public view returns (Pool memory) {
        return pools[index];
    }

    function getTotalPoolWeight() public view returns (uint256) {
        return totalPoolWeight;
    }

    function getStakeAmount(
        uint256 poolId,
        address account
    ) public view returns (UserStake memory) {
        if (account != msg.sender) {
            revert B2Stake__NotAccountSelf();
        }
        return userStakeList[poolId][account];
    }
}
