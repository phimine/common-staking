# 系统概述

B2Stake 是一个基于区块链的质押系统，支持多种代币的质押，并基于用户质押的代币数量和时间长度分配 B2 代币作为奖励。系统可提供多个质押池，每个池可以独立配置质押代币、奖励计算等。

# 功能需求

1. 质押池（不同的代币、不同的权重、奖励计算B2perStake、质押设置）
   1.1 新增质押池
   1.2 更新质押池（权重、最小质押数、解除质押锁定数）
   1.3 计算质押池奖励
2. 质押功能
   2.1 质押代币
3. 解除质押功能
   3.1 申请解除质押代币
   3.2 提现解除的代币
4. 代币奖励
5. 合约升级

# 数据结构

```
质押池 {
    代币地址
    权重
    最小质押数
    质押总量
    质押奖励系数B2perStake
    最后一次计算奖励的区块号
    解除质押锁定区块数
}
```

```
用户质押 {
    用户质押的代币数量
    已计算的代币奖励数量
    待领取的代币奖励数量
    解除质押请求列表
}
```

```
解除质押请求 {
    解除质押数量
    解锁区块
}
```

# 状态变量

B2代币
每个区块的B2奖励数量
开始区块
结束区块

质押池列表
总权重

提现暂停
获得奖励暂停

用户质押（pid => address => 用户质押）

# 功能划分

管理员：
状态变量设置：SetB2、SetStartBlock、SetEndBlock、SetB2PerBlock
质押池：AddPool、UpdatePool、SetPoolWeight
暂停功能：PauseWithdraw、UnpauseWithdraw、PauseClaim、UnpauseClaim

用户：
质押功能：Deposit、Unstake
提现功能：Withdraw、Claim
查询功能：查询待领取的B2奖励、查询质押池中的质押数量、查询可提现的额度

# 单元测试

```shell
yarn test
---------------|----------|----------|----------|----------|----------------|
File           |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
---------------|----------|----------|----------|----------|----------------|
 contracts/    |    99.41 |    85.96 |    96.97 |    96.15 |                |
  B2Stake.sol  |    99.32 |     83.1 |    95.83 |     95.4 |... 691,702,713 |
  FMMToken.sol |      100 |      100 |      100 |      100 |                |
  MyERC20.sol  |      100 |       75 |      100 |      100 |                |
---------------|----------|----------|----------|----------|----------------|
All files      |    99.41 |    85.96 |    96.97 |    96.15 |                |
---------------|----------|----------|----------|----------|----------------|
```
