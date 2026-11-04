// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PriceOracle
/// @notice Stores the USD price of the vault's share token, used to value withdrawals.
/// @dev DEMO CONTRACT WITH PLANTED BUGS. Do not deploy.
contract PriceOracle {
    address public owner;
    uint256 public price; // 18 decimals
    uint256 public updatedAt;

    event PriceUpdated(uint256 price, uint256 at);

    constructor(uint256 initialPrice) {
        owner = msg.sender;
        price = initialPrice;
        updatedAt = block.timestamp;
    }

    // PLANTED (C-01): anyone can set the price. There is no owner check.
    function setPrice(uint256 newPrice) external {
        price = newPrice;
        updatedAt = block.timestamp;
        emit PriceUpdated(newPrice, block.timestamp);
    }

    // PLANTED (L-03): staleness relies on block.timestamp with a tight window.
    function isFresh() external view returns (bool) {
        return block.timestamp - updatedAt < 1 hours;
    }
}
