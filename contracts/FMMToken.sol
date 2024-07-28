// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.24;

// Error
error FMMToken__NotOwner();
error FMMToken__InvalidAddress();
error FMMToken__InvalidAmount();
error FMMToken__InsuffienceBalance();
error FMMToken__InsuffienceAllowance();

/**
 * @title 符合 ERC-20 标准的代币合约
 * @author Carl Fu
 * @notice
 */
contract FMMToken {
    // Type Declaration
    // State Variables: 名称、符号、小数位、总供应量、owner、
    string private name;
    string private symbol;
    uint8 private constant DECIMALS = 18;
    uint256 private totalSupply;
    address private immutable i_owner;

    // account => amount
    mapping(address => uint256) private balances;
    // owner => approved => amount
    mapping(address => mapping(address => uint256)) private allowances;

    // Event
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(
        address indexed owner,
        address indexed approved,
        uint256 amount
    );

    // Modifier
    modifier onlyOwner() {
        if (i_owner != msg.sender) {
            revert FMMToken__NotOwner();
        }
        _;
    }

    modifier validAddress(address _addr) {
        if (_addr == address(0)) {
            revert FMMToken__InvalidAddress();
        }
        _;
    }

    modifier validAmount(uint256 amount) {
        if (amount <= 0) {
            revert FMMToken__InvalidAmount();
        }
        _;
    }

    // Construstor
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        i_owner = msg.sender;
    }

    // Functions
    // Owner Function
    function mint(
        address to,
        uint256 amount
    ) external onlyOwner validAddress(to) validAmount(amount) {
        // Check: 调用者是owner、to地址有效、amount大于0

        // Effect: to账户资产增加、totalSupply资产增加
        balances[to] += amount;
        totalSupply += amount;

        // Interaction
        emit Transfer(address(0), to, amount);
    }

    function burn(
        address from,
        uint256 amount
    ) external onlyOwner validAddress(from) validAmount(amount) {
        // Check: 调用者是owner、from地址有效、amount大于0、from地址余额大于amount
        if (balances[from] < amount) {
            revert FMMToken__InsuffienceBalance();
        }

        // Effect: from地址余额减少、totalSupply减少、
        balances[from] -= amount;
        totalSupply -= amount;

        // Interaction
        emit Transfer(from, address(0), amount);
    }

    // User Functions
    // 1. 转账I：向目标地址转账
    function transfer(address to, uint256 amount) external {
        // Check: 账户余额大于amount
        if (balances[msg.sender] < amount) {
            revert FMMToken__InsuffienceBalance();
        }

        // Effect: msg.sender减少、to增加
        balances[msg.sender] -= amount;
        balances[to] += amount;

        // Interaction

        emit Transfer(msg.sender, to, amount);
    }

    // 2. 转账II：从地址向目标地址转账（需要授权）
    function transferFrom(address from, address to, uint256 amount) external {
        // Check: from余额大于amount、msg.sender授权额度大于amount
        if (balances[from] < amount) {
            revert FMMToken__InsuffienceBalance();
        }
        if (from != msg.sender && allowances[from][msg.sender] < amount) {
            revert FMMToken__InsuffienceAllowance();
        }

        // Effect：from减少、to增加、allowance额度减少
        balances[from] -= amount;
        balances[to] += amount;
        if (from != msg.sender) {
            allowances[from][msg.sender] -= amount;
        }

        // Interaction
        emit Transfer(from, to, amount);
    }

    // 3. 授权：给地址授权
    function approve(
        address approved,
        uint256 amount
    ) external validAmount(amount) validAddress(approved) {
        // Check:

        // Effect: allowance更新
        allowances[msg.sender][approved] += amount;

        // Interaction
        emit Approval(msg.sender, approved, amount);
    }

    // receive/fallback
    // external
    // internal
    // view/pure
    function balanceOf(address _addr) public view returns (uint256) {
        return balances[_addr];
    }

    function allowanceOf(
        address owner,
        address approved
    ) public view returns (uint256) {
        return allowances[owner][approved];
    }

    function getTotalSupply() public view returns (uint256) {
        return totalSupply;
    }

    function getName() public view returns (string memory) {
        return name;
    }

    function getSymbol() public view returns (string memory) {
        return symbol;
    }

    function getDecimals() public pure returns (uint8) {
        return DECIMALS;
    }

    function getOwner() public view returns (address) {
        return i_owner;
    }
}
