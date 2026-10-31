// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockAgentUSD (aUSD)
/// @notice DEMO-ONLY ERC-20 used as the settlement unit in the AgentPay Escrow demo.
///         It mimics a USD stablecoin (6 decimals, like USDT) so the escrow flow
///         reads the way a real agent-payments deployment would. `mint` is open
///         on purpose: this is test currency with no value, for testnet/local use
///         only. It is NOT a real stablecoin and must never be presented as one.
contract MockAgentUSD {
    string public constant name = "Agent USD (test)";
    string public constant symbol = "aUSD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /// @notice Open mint — demo faucet. Test tokens only, no value.
    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "aUSD: allowance too low");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "aUSD: transfer to zero address");
        require(balanceOf[from] >= amount, "aUSD: balance too low");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
